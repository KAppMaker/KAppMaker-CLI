import sys
import os
import re
import time
import base64
import subprocess
import argparse
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

SCRIPT_DIR = Path(__file__).parent
FAL_SUBMIT_URL = "https://queue.fal.run/fal-ai/nano-banana-pro/edit"
DISTRIBUTION_DIR = SCRIPT_DIR / "../../distribution"

# Play Store ↔ App Store locale mapping
LOCALE_MAPPING = {
    "ar": "ar-SA",
    "cs-CZ": "cs",
    "da-DK": "da",
    "de-DE": "de-DE",
    "el-GR": "el",
#     "en-US": "en-US",
    "es-ES": "es-ES",
    "fi-FI": "fi",
    "fil": None,          # No App Store equivalent
    "fr-FR": "fr-FR",
    "fr-CA": "fr-CA",
    "hi-IN": "hi",
    "hu-HU": "hu",
    "id": "id",
    "it-IT": "it",
    "ja-JP": "ja",
    "ko-KR": "ko",
    "ms": "ms",
    "nl-NL": "nl-NL",
    "no-NO": "no",
    "pl-PL": "pl",
    "pt-BR": "pt-BR",
    "ro": "ro",
    "ru-RU": "ru",
    "sv-SE": "sv",
    "th": "th",
    "tr-TR": "tr",
    "uk": "uk",
    "vi": "vi",
    "zh-CN": "zh-Hans",
    "zh-TW": "zh-Hant",
}


DEFAULT_PLAYSTORE_LOCALES = list(LOCALE_MAPPING.keys())


def run_combine(store_url, output_path):
    """Run combine_screenshots.py with --url. Returns the number of real screenshots."""
    cmd = [
        sys.executable, str(SCRIPT_DIR / "combine_screenshots.py"),
        "--url", store_url,
        "--output", str(output_path),
    ]
    print(f"Generating combined screenshot grid from store URL...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running combine_screenshots.py:\n{result.stderr}")
        sys.exit(1)
    print(result.stdout.strip())

    # Parse "Combined N images into ..." from output
    match = re.search(r'Combined (\d+) images into', result.stdout)
    return int(match.group(1)) if match else None


def run_split(image_path, output_dir, count=None):
    """Run split_store_screenshots.py on an image."""
    cmd = [
        sys.executable, str(SCRIPT_DIR / "split_store_screenshots.py"),
        str(image_path), str(output_dir),
    ]
    if count is not None:
        cmd += ["--count", str(count)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Error running split_store_screenshots.py:\n{result.stderr}")
        return False
    print(result.stdout.strip())
    return True


def image_to_data_uri(image_path):
    """Convert a local image file to a base64 data URI."""
    path = Path(image_path)
    suffix = path.suffix.lower()
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(suffix, "image/png")
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def submit_translation(fal_key, image_data_uri, locale, resolution):
    """Submit an async translation request to fal.ai. Returns (locale, info_dict) or (locale, None) on error."""
    headers = {"Authorization": f"Key {fal_key}", "Content-Type": "application/json"}
    payload = {
        "prompt": (
            f"Keep the image exactly the same — same layout, same design, same colors, same structure. "
            f"Only translate all visible text into {locale}. Do not change anything else."
        ),
        "image_urls": [image_data_uri],
        "num_images": 1,
        "resolution": resolution,
        "output_format": "png",
        "aspect_ratio": "auto",
        "safety_tolerance": "6",
    }
    try:
        resp = requests.post(FAL_SUBMIT_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        request_id = data.get("request_id")
        print(f"  [{locale}] Submitted -> request_id: {request_id}")
        return locale, {
            "request_id": request_id,
            "status_url": data.get("status_url"),
            "response_url": data.get("response_url"),
        }
    except Exception as e:
        print(f"  [{locale}] Failed to submit: {e}")
        return locale, None


def check_status(fal_key, status_url):
    """Check the status of a fal.ai request. Returns status dict."""
    headers = {"Authorization": f"Key {fal_key}"}
    resp = requests.get(status_url, headers=headers)
    resp.raise_for_status()
    return resp.json()


def get_result(fal_key, response_url):
    """Get the result of a completed fal.ai request. Returns result dict."""
    headers = {"Authorization": f"Key {fal_key}"}
    resp = requests.get(response_url, headers=headers)
    resp.raise_for_status()
    return resp.json()


def download_image(url, output_path):
    """Download an image from a URL to a local path."""
    resp = requests.get(url)
    resp.raise_for_status()
    Path(output_path).write_bytes(resp.content)


def save_to_fastlane(split_dir, locale, count):
    """Move split images to iOS & Android Fastlane folders, using actual split filenames."""
    split_files = sorted(split_dir.glob("image_*.png"), key=lambda p: int(re.search(r'image_(\d+)\.png', p.name).group(1)))

    if len(split_files) != count:
        print(f"Warning: Expected {count} split images but found {len(split_files)} for {locale}")

    # iOS
    ios_locale = LOCALE_MAPPING.get(locale)
    if ios_locale:
        ios_dir = DISTRIBUTION_DIR / "ios" / "appstore_metadata" / "screenshots" / ios_locale
        ios_dir.mkdir(parents=True, exist_ok=True)
        for i, source_file in enumerate(split_files):
            target_name = f"{i}_APP_IPHONE_65_{i}.png"
            shutil.copy(source_file, ios_dir / target_name)

    # Android
    android_dir = DISTRIBUTION_DIR / "android" / "playstore_metadata" / locale / "images/phoneScreenshots"
    android_dir.mkdir(parents=True, exist_ok=True)
    for i, source_file in enumerate(split_files):
        target_name = f"{i+1}_{locale}.png"  # Android index starts at 1
        shutil.copy(source_file, android_dir / target_name)



def main():
    parser = argparse.ArgumentParser(description="Translate app store screenshots into multiple locales using fal.ai Nano Banana Pro.")

    parser.add_argument("--url", type=str, required=True, help="App Store or Play Store URL")
    parser.add_argument("--output", type=str, default=str(DISTRIBUTION_DIR), help="Output directory")
    parser.add_argument("--locales", type=str, nargs="*", default=DEFAULT_PLAYSTORE_LOCALES, help="Target locales")
    parser.add_argument("--poll-interval", type=int, default=10, help="Seconds between status checks (default: 10)")
    parser.add_argument("--resolution",type=str,default="2K",choices=["1K", "2K", "4K"],help="Resolution for translated images (default: 2K)")

    args = parser.parse_args()


    # Try environment variable first
    fal_key = os.environ.get("FAL_API_KEY", "")

  
    if not fal_key:
        credentials_path = Path.home() / "credentials" / "credentials.txt"
        if credentials_path.exists():
            # Read lines and find FAL_API_KEY
            with open(credentials_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("FAL_API_KEY="):
                        # Remove FAL_API_KEY= and any quotes
                        fal_key = line.split("=", 1)[1].strip().strip('"')
                        break

    if not fal_key:
        print("Error: FAL_API_KEY not found in environment variable or credentials file.")
        sys.exit(1)


    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: Generate combined screenshot grid
    temp_dir = output_dir / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    combined_path = temp_dir / "combined_original.png"
    screenshot_count = run_combine(args.url, combined_path)

    if not combined_path.exists():
        print("Error: Combined image was not created.")
        sys.exit(1)

    print(f"\nCombined image saved to: {combined_path}")
    if screenshot_count:
        print(f"Original screenshot count: {screenshot_count}")

    # Step 2: Convert to data URI for fal.ai
    print("Encoding image for API...")
    image_data_uri = image_to_data_uri(combined_path)

    # Step 3: Submit translation requests in parallel
    locales = args.locales
    print(f"\nSubmitting translation requests for {len(locales)} locale(s): {', '.join(locales)}")

    pending = {}  # locale -> {request_id, status_url, response_url}
    failed_locales = []

    with ThreadPoolExecutor(max_workers=len(locales)) as executor:
        futures = [executor.submit(submit_translation, fal_key, image_data_uri, locale, args.resolution) for locale in locales]
        for future in futures:
            locale, info = future.result()
            if info:
                pending[locale] = info
            else:
                failed_locales.append(locale)

    if not pending:
        print("\nAll submissions failed. Exiting.")
        sys.exit(1)

    # Step 4: Poll for status every N seconds
    completed = {}  # locale -> {request_id, status_url, response_url}
    print(f"\nPolling for results every {args.poll_interval}s...")

    while pending:
        time.sleep(args.poll_interval)

        done_locales = []
        for locale, info in pending.items():
            try:
                status_data = check_status(fal_key, info["status_url"])
                status = status_data.get("status", "UNKNOWN")
                print(f"  [{locale}] Status: {status}")

                if status == "COMPLETED":
                    completed[locale] = info
                    done_locales.append(locale)
                elif status == "FAILED":
                    error = status_data.get("error", "Unknown error")
                    print(f"  [{locale}] FAILED: {error}")
                    failed_locales.append(locale)
                    done_locales.append(locale)
            except Exception as e:
                print(f"  [{locale}] Error checking status: {e}")

        for loc in done_locales:
            del pending[loc]

    # Step 5: Download results and split
    print(f"\n--- Results ---")
    if failed_locales:
        print(f"Failed locales: {', '.join(failed_locales)}")

    for locale, info in completed.items():
        print(f"\n[{locale}] Downloading translated image...")
        try:
            result_data = get_result(fal_key, info["response_url"])
            images = result_data.get("images", [])
            if not images:
                print(f"  [{locale}] No images in result.")
                failed_locales.append(locale)
                continue

            image_url = images[0]["url"]




            # Temp folder for split images
            temp_dir = output_dir / "temp" / locale.lower().replace(" ", "_")
            temp_dir.mkdir(parents=True, exist_ok=True)
            downloaded_path = temp_dir / "combined_translated.png"
            download_image(image_url, downloaded_path)
            print(f"  [{locale}] Downloaded translated image: {downloaded_path}")


            # Split combined image
            split_dir = temp_dir / "split"
            split_dir.mkdir(parents=True, exist_ok=True)
            run_split(downloaded_path, split_dir, count=screenshot_count)

            # Save split images to Fastlane folders
            save_to_fastlane(split_dir, locale, screenshot_count)

            
            # locale_dir = output_dir / locale.lower().replace(" ", "_")
            # locale_dir.mkdir(parents=True, exist_ok=True)

            # translated_path = locale_dir / "combined_translated.png"
            # download_image(image_url, translated_path)
            # print(f"  [{locale}] Saved combined image -> {translated_path}")

            # # Split into individual screenshots (only real ones, skip placeholders)
            # split_dir = locale_dir / "split"
            # print(f"  [{locale}] Splitting into individual screenshots...")
            # run_split(translated_path, split_dir, count=screenshot_count)

        except Exception as e:
            print(f"  [{locale}] Error processing result: {e}")
            failed_locales.append(locale)

    # Summary
    print(f"\n{'='*40}")
    print(f"Completed: {len(completed)} locale(s)")
    if failed_locales:
        unique_failed = list(dict.fromkeys(failed_locales))
        print(f"Failed:    {len(unique_failed)} locale(s) -> {', '.join(unique_failed)}")
    print(f"Output:    {output_dir.resolve()}")

    # ✅ Clean up temp folder if everything succeeded
    temp_dir = output_dir / "temp"
    if not failed_locales:
        shutil.rmtree(temp_dir)
        print(f"\nTemporary files cleaned up: {temp_dir}")
    else:
        print(f"\nTemp folder kept for failed locales: {temp_dir}")



if __name__ == "__main__":
    main()
