import sys
import re
import tempfile
import shutil
from PIL import Image, ImageDraw, ImageFont
import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests


def load_and_resize(args):
    image_path, cell_width, cell_height, aspect_ratio = args
    img = Image.open(image_path)

    # Fit within cell while keeping the first image's aspect ratio
    if cell_width / cell_height > aspect_ratio:
        tile_h = cell_height
        tile_w = int(cell_height * aspect_ratio)
    else:
        tile_w = cell_width
        tile_h = int(cell_width / aspect_ratio)

    img = img.resize((tile_w, tile_h), Image.LANCZOS)

    # Center on a black cell-sized background
    cell = Image.new("RGB", (cell_width, cell_height), (0, 0, 0))
    x_offset = (cell_width - tile_w) // 2
    y_offset = (cell_height - tile_h) // 2
    cell.paste(img, (x_offset, y_offset))
    return cell


def create_placeholder(cell_width, cell_height, aspect_ratio):
    # Fit placeholder to same aspect ratio as real tiles
    if cell_width / cell_height > aspect_ratio:
        height = cell_height
        width = int(cell_height * aspect_ratio)
    else:
        width = cell_width
        height = int(cell_width / aspect_ratio)

    cell = Image.new("RGB", (cell_width, cell_height), (0, 0, 0))
    img = Image.new("RGB", (width, height), (20, 20, 20))
    draw = ImageDraw.Draw(img)

    text = "No Image"
    font_size = min(width, height) // 10
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except (OSError, IOError):
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    draw.text((x, y), text, fill=(100, 100, 100), font=font)

    x_offset = (cell_width - width) // 2
    y_offset = (cell_height - height) // 2
    cell.paste(img, (x_offset, y_offset))
    return cell


def fetch_appstore_screenshots(url, max_count=8):
    """Fetch screenshot URLs from an App Store listing."""
    match = re.search(r'/id(\d+)', url)
    if not match:
        print("Error: Could not extract app ID from App Store URL.")
        sys.exit(1)
    app_id = match.group(1)
    print(f"Fetching App Store screenshots for app ID: {app_id}")

    # Try iTunes Lookup API first
    resp = requests.get(f"https://itunes.apple.com/lookup?id={app_id}")
    resp.raise_for_status()
    data = resp.json()
    if data.get("resultCount", 0) == 0:
        print("Error: App not found on the App Store.")
        sys.exit(1)

    result = data["results"][0]
    screenshot_urls = result.get("screenshotUrls", [])
    if screenshot_urls:
        return screenshot_urls[:max_count]

    # Fallback: scrape the App Store web page
    print("  iTunes API returned no screenshots, scraping App Store page...")
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
    resp.raise_for_status()

    # Find all mzstatic PurpleSource URLs (these are screenshots)
    all_urls = re.findall(r'https://is\d+-ssl\.mzstatic\.com/image/thumb/PurpleSource[^\s"<>)\']+'  , resp.text)

    # Deduplicate by base path (same image appears in multiple sizes)
    seen_bases = []
    seen_base_set = set()
    for img_url in all_urls:
        # Skip template URLs containing {w} or {h}
        if '{w}' in img_url or '{h}' in img_url:
            continue
        base = re.sub(r'/\d+x\d+[a-z]*(-\d+)?\.[a-z]+$', '', img_url)
        if base not in seen_base_set:
            seen_base_set.add(base)
            seen_bases.append(base)

    if not seen_bases:
        print("Error: No screenshots found for this app.")
        sys.exit(1)

    # Build high-resolution URLs (use 600x0 to get full width, auto height)
    screenshot_urls = [f"{base}/600x0w.jpg" for base in seen_bases]
    return screenshot_urls[:max_count]


def fetch_playstore_screenshots(url, max_count=8):
    """Fetch screenshot URLs from a Play Store listing."""
    from google_play_scraper import app as gp_app

    match = re.search(r'[?&]id=([^&]+)', url)
    if not match:
        print("Error: Could not extract package ID from Play Store URL.")
        sys.exit(1)
    package_id = match.group(1)
    print(f"Fetching Play Store screenshots for package: {package_id}")

    result = gp_app(package_id)
    screenshot_urls = result.get("screenshots", [])
    if not screenshot_urls:
        print("Error: No screenshots found for this app.")
        sys.exit(1)

    return screenshot_urls[:max_count]


def download_screenshots(urls, temp_dir):
    """Download images from URLs into a temp directory. Returns list of file paths."""
    paths = []
    for i, url in enumerate(urls):
        print(f"  Downloading screenshot {i + 1}/{len(urls)}...")
        resp = requests.get(url)
        resp.raise_for_status()

        ext = ".png"
        content_type = resp.headers.get("Content-Type", "")
        if "jpeg" in content_type or "jpg" in content_type:
            ext = ".jpg"
        elif "webp" in content_type:
            ext = ".webp"

        file_path = Path(temp_dir) / f"screenshot_{i:02d}{ext}"
        file_path.write_bytes(resp.content)
        paths.append(file_path)

    print(f"  Downloaded {len(paths)} screenshots.")
    return paths


def main():
    parser = argparse.ArgumentParser(description="Combine multiple images into a single grid image.")

    parser.add_argument("image_paths", nargs="*", type=str, help="Paths to input images (left-to-right, top-to-bottom)")
    parser.add_argument("--url", type=str, default=None, help="App Store or Play Store URL to download screenshots from")
    parser.add_argument("--output", type=str, default="combined.png", help="Output image path (default: combined.png)")

    parser.add_argument("--rows", type=int, default=None, help="Number of rows (default: 4, or 2 with --url)")
    parser.add_argument("--cols", type=int, default=None, help="Number of columns (default: 4, or 4 with --url)")
    parser.add_argument("--width", type=int, default=None, help="Output image width (default: cols * first image width)")
    parser.add_argument("--height", type=int, default=None, help="Output image height (default: rows * first image height)")
    parser.add_argument("--gap", type=int, default=0, help="Gap between tiles in pixels (default: 0)")

    args = parser.parse_args()

    if not args.url and not args.image_paths:
        parser.error("Either provide image paths or use --url to download from a store listing.")

    temp_dir = None

    if args.url:
        rows = args.rows if args.rows else 2
        cols = args.cols if args.cols else 4
        max_screenshots = rows * cols

        if "apps.apple.com" in args.url:
            screenshot_urls = fetch_appstore_screenshots(args.url, max_count=max_screenshots)
        elif "play.google.com" in args.url:
            screenshot_urls = fetch_playstore_screenshots(args.url, max_count=max_screenshots)
        else:
            print("Error: URL must be an App Store (apps.apple.com) or Play Store (play.google.com) link.")
            sys.exit(1)

        temp_dir = tempfile.mkdtemp(prefix="screenshots_")
        image_paths = download_screenshots(screenshot_urls, temp_dir)
    else:
        rows = args.rows if args.rows else 4
        cols = args.cols if args.cols else 4
        image_paths = [Path(p) for p in args.image_paths]
        for p in image_paths:
            if not p.exists():
                print(f"Error: File not found -> {p}")
                sys.exit(1)

    total_cells = rows * cols
    gap = args.gap

    try:
        if len(image_paths) > total_cells:
            print(f"Warning: {len(image_paths)} images provided but grid is {rows}x{cols} ({total_cells} cells). Extra images will be ignored.")
            image_paths = image_paths[:total_cells]

        # Read first image to get aspect ratio and default output size
        first_img = Image.open(image_paths[0])
        aspect_ratio = first_img.width / first_img.height
        output_width = args.width if args.width else first_img.width * cols + gap * (cols + 1)
        output_height = args.height if args.height else first_img.height * rows + gap * (rows + 1)
        first_img.close()
        print(f"Using aspect ratio from first image: {first_img.width}x{first_img.height} ({aspect_ratio:.4f})")

        total_gap_x = gap * (cols + 1)
        total_gap_y = gap * (rows + 1)
        tile_width = (output_width - total_gap_x) // cols
        tile_height = (output_height - total_gap_y) // rows

        # Load and resize images in parallel
        load_args = [(str(p), tile_width, tile_height, aspect_ratio) for p in image_paths]
        with ThreadPoolExecutor() as executor:
            tiles = list(executor.map(load_and_resize, load_args))

        # Create output canvas (black background)
        canvas = Image.new("RGB", (output_width, output_height), (0, 0, 0))

        # Place tiles and placeholders
        for index in range(total_cells):
            r = index // cols
            c = index % cols

            x = gap * (c + 1) + c * tile_width
            y = gap * (r + 1) + r * tile_height

            if index < len(tiles):
                canvas.paste(tiles[index], (x, y))
            else:
                placeholder = create_placeholder(tile_width, tile_height, aspect_ratio)
                canvas.paste(placeholder, (x, y))

        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output_path)
        print(f"Done! Combined {len(image_paths)} images into {rows}x{cols} grid -> {output_path} ({output_width}x{output_height})")
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
