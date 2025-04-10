import pytest
from playwright.sync_api import Page, expect
import time
import os
from datetime import datetime

def test_youtube_to_mp3_conversion(page: Page):
    # Create snapshots directory if it doesn't exist
    snapshots_dir = "test_snapshots"
    if not os.path.exists(snapshots_dir):
        os.makedirs(snapshots_dir)
    
    # Navigate to the converter page
    page.goto("http://localhost:3000/")
    
    # Take initial snapshot
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    page.screenshot(path=f"{snapshots_dir}/initial_state_{timestamp}.png")
    
    # Verify the page title
    expect(page).to_have_title("YouTube MP3 Drive Uploader")
    
    # Find the URL input field and enter the YouTube URL
    url_input = page.get_by_label("YouTube URL")
    url_input.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    
    # Wait for thumbnail to appear and verify it
    thumbnail = page.locator('img[alt="Video thumbnail"]')
    expect(thumbnail).to_be_visible(timeout=5000)
    
    # Verify the thumbnail source contains the correct video ID
    thumbnail_src = thumbnail.get_attribute('src')
    assert 'dQw4w9WgXcQ' in thumbnail_src, "Thumbnail URL does not contain the correct video ID"
    
    # Wait for the time range slider to appear
    time_slider = page.locator('.MuiSlider-root')
    expect(time_slider).to_be_visible(timeout=5000)
    
    # Verify time range display is visible
    time_display = page.get_by_text("Select video range:")
    expect(time_display).to_be_visible()
    
    # Take snapshot after URL input and thumbnail appears with time range
    page.screenshot(path=f"{snapshots_dir}/after_url_input_with_time_range_{timestamp}.png")
    
    # Simulate time range selection (set to 30-60 seconds)
    page.evaluate("""() => {
        const slider = document.querySelector('.MuiSlider-root');
        const event = new Event('change');
        Object.defineProperty(event, 'target', {value: slider});
        slider.value = [30, 60];
        slider.dispatchEvent(event);
    }""")
    
    # Take snapshot after time range selection
    page.screenshot(path=f"{snapshots_dir}/after_time_range_selection_{timestamp}.png")
    
    # Click the convert button
    convert_button = page.get_by_role("button", name="Convert to MP3")
    convert_button.click()
    
    # Wait for conversion to complete (max 5 minutes)
    max_wait_time = 300  # seconds
    start_time = time.time()
    
    while time.time() - start_time < max_wait_time:
        # Check if the file appears in the converted files list
        file_name = "Rick Astley Never Gonna Give You Up Official Music Video.mp3"
        if page.get_by_text(file_name).is_visible():
            print(f"File '{file_name}' found in converted files list")
            # Take snapshot after conversion complete
            page.screenshot(path=f"{snapshots_dir}/conversion_complete_{timestamp}.png")
            break
        time.sleep(2)  # Wait 2 seconds before checking again
    else:
        # Take snapshot if conversion failed
        page.screenshot(path=f"{snapshots_dir}/conversion_failed_{timestamp}.png")
        raise TimeoutError("Conversion did not complete within the expected time")
    
    # Verify thumbnail and time range are no longer visible
    expect(thumbnail).not_to_be_visible(timeout=5000)
    expect(time_slider).not_to_be_visible(timeout=5000)
    
    # Find and click the download button
    download_button = page.get_by_role("button", name="download")
    download_button.click()
    
    # Wait a moment for the download to start
    page.wait_for_timeout(2000)  # 2 seconds
    
    # Take final snapshot
    page.screenshot(path=f"{snapshots_dir}/final_state_{timestamp}.png")
    
    print("Test completed successfully!")
    print(f"Snapshots saved in directory: {snapshots_dir}") 