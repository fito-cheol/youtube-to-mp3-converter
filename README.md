# YouTube MP3 Converter

A web application that allows users to convert YouTube videos to MP3 files. Built with React, TypeScript, and Node.js.

## Features

- Convert YouTube videos to MP3 format
- Simple and intuitive user interface
- Download converted files directly from the browser
- Server-side processing with FFmpeg

## Prerequisites

Before running this application, make sure you have the following installed:
- Node.js (v14 or higher)
- FFmpeg
- yarn or npm

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