# YouTube MP3 Converter

A web application that allows users to convert YouTube videos to MP3 files. Built with React, TypeScript, and Node.js.

## Features

- Convert YouTube videos to MP3 format
- Simple and intuitive user interface
- Download converted files directly from the browser
- Server-side processing with FFmpeg
- Paginated playlist support that loads the newest 50 videos first and lets you fetch older batches on demand

## Prerequisites

Before running this application, make sure you have the following installed:
- Node.js (v14 or higher)
- yarn or npm

## FFmpeg Installation

This application requires FFmpeg for audio conversion. Follow these steps to set it up:

1. Download FFmpeg:
   - Windows: Download from [BtbN's FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds/releases)
   - Mac: `brew install ffmpeg`
   - Linux: `sudo apt-get install ffmpeg`

2. For Windows:
   - Extract the downloaded zip file
   - Create a folder named `ffmpeg` in the project root
   - Copy the contents of the `bin` folder from the extracted files to the `ffmpeg/ffmpeg-master-latest-win64-gpl/bin` directory

3. For Mac/Linux:
   - Update the FFmpeg path in `server/index.ts` to point to your system's FFmpeg installation

## Installation

1. Clone the repository:
```bash
git clone https://github.com/fito-cheol/youtube-mp3-converter.git
cd youtube-mp3-converter
```

2. Install dependencies:
```bash
yarn install
```

3. Start the development server:
```bash
# Start both frontend and backend
yarn dev

# Or start them separately:
yarn start    # Frontend
yarn server   # Backend
```

4. Open your browser and navigate to `http://localhost:3000`

## Environment Setup

Make sure FFmpeg is properly installed and accessible in your system path. The application expects FFmpeg binaries to be present in the `ffmpeg` directory.

## Usage

1. Enter a YouTube URL in the input field
2. Click "Convert to MP3"
3. Wait for the conversion to complete
4. Click the download button to save the MP3 file

> **Note:** When you paste a playlist URL the app now requests the newest 50 items first. Use the pagination controls in the playlist panel to browse older videos in additional 50-item pages.

## Troubleshooting

### HTTP 403 Forbidden Error

If you encounter an error like `ERROR: The downloaded file is empty` or `HTTP Error 403: Forbidden` when downloading videos, this is typically caused by YouTube API quota limitations or billing issues.

**Solution:**
- Check your Google Cloud Console to ensure your YouTube Data API is properly configured
- Verify that billing is enabled for your Google Cloud project
- Ensure your API key has sufficient quota remaining
- If you see "The downloaded file is empty" errors, it may indicate that your YouTube Data API quota has been exceeded or billing is not properly set up

For more information, visit the [YouTube Data API documentation](https://developers.google.com/youtube/v3/getting-started).

## Tech Stack

- Frontend:
  - React
  - TypeScript
  - Material-UI
  - Axios

- Backend:
  - Node.js
  - Express
  - youtube-dl-exec
  - FFmpeg

## License

MIT License

# YouTube to MP3 Converter Test

This is an automated test script for the YouTube to MP3 converter application.

## Setup

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

2. Install Playwright browsers:
```bash
playwright install
```

## Running the Test

Make sure your converter application is running at `http://localhost:3000`, then run:

```bash
pytest test_youtube_converter.py -v
```

The test will:
1. Navigate to the converter page
2. Input the YouTube URL
3. Start the conversion
4. Wait for the conversion to complete
5. Download the converted MP3 file

The test has a maximum wait time of 5 minutes for the conversion to complete. 