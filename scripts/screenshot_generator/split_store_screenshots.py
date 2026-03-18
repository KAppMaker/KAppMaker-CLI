import sys
from PIL import Image
import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

def process_tile(args):
    image_path, output_dir, row, col, tile_width, tile_height, target_size, zoom_factor, cols, gap = args

    # Open image inside thread (thread-safe)
    img = Image.open(image_path)

   

    # Adjust crop with optional gap
    left = col * tile_width + gap
    upper = row * tile_height + gap
    right = (col + 1) * tile_width - gap
    lower = (row + 1) * tile_height - gap
    sub_img = img.crop((left, upper, right, lower))


    # Apply slight zoom
    zoom_w = int(sub_img.width / zoom_factor)
    zoom_h = int(sub_img.height / zoom_factor)
    left_crop = (sub_img.width - zoom_w) // 2
    top_crop = (sub_img.height - zoom_h) // 2
    sub_img = sub_img.crop(
        (left_crop, top_crop, left_crop + zoom_w, top_crop + zoom_h)
    )

    # High-quality resize
    sub_img_resized = sub_img.resize(target_size, Image.LANCZOS)

    # Save
    index = row * cols + col
    output_path = output_dir / f"image_{index}.png"
    sub_img_resized.save(output_path)

    print(f"Saved {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Split an image into tiles.")

    parser.add_argument("image_path", type=str, help="Path to input image")
    parser.add_argument("output_dir", type=str, help="Directory to save tiles")

    # ===== Configuration (with defaults) =====
    parser.add_argument("--rows", type=int, default=2, help="Number of rows (default: 2)")
    parser.add_argument("--cols", type=int, default=4, help="Number of columns (default: 4)")
    parser.add_argument("--zoom", type=float, default=1.07, help="Zoom factor (default: 1.07)")
    parser.add_argument("--target-width", type=int, default=1284, help="Output width per tile (default: 1290)")
    parser.add_argument("--target-height", type=int, default=2778, help="Output height per tile (default: 2796)")
    parser.add_argument("--gap", type=int, default=0, help="Optional spacing/padding inside each tile (default: 0 pixels)")
    parser.add_argument("--count", type=int, default=None, help="Only output the first N tiles (default: all tiles)")
    # =========================================

    args = parser.parse_args()

    image_path = Path(args.image_path)
    output_dir = Path(args.output_dir)

    if not image_path.exists():
        print(f"Error: File not found -> {image_path}")
        sys.exit(1)

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Configuration
    rows = args.rows
    cols = args.cols
    zoom_factor = args.zoom
    target_size = (args.target_width, args.target_height)
    gap = args.gap

    # Load once to compute tile sizes
    img = Image.open(image_path)
    tile_width = img.width // cols
    tile_height = img.height // rows
    img.close()

    # Prepare arguments
    total = rows * cols
    count = min(args.count, total) if args.count is not None else total

    args_list = []
    for row in range(rows):
        for col in range(cols):
            index = row * cols + col
            if index >= count:
                break
            args_list.append((
                image_path,
                output_dir,
                row,
                col,
                tile_width,
                tile_height,
                target_size,
                zoom_factor,
                cols,
                gap
            ))

    # Process in parallel
    with ThreadPoolExecutor() as executor:
        executor.map(process_tile, args_list)

    print(f"Done! {count} images cropped, zoomed slightly, and resized.")

if __name__ == "__main__":
    main()
