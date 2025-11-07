#!/bin/bash

# Download Poppins font files from Google Fonts
# Using google-webfonts-helper API

echo "Downloading Poppins font files..."

cd public/fonts

# Download Poppins Light 300
curl -o poppins-v20-latin-300.woff2 "https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLDz8Z1JlFc-K.woff2"

# Download Poppins Regular 400
curl -o poppins-v20-latin-regular.woff2 "https://fonts.gstatic.com/s/poppins/v20/pxiEyp8kv8JHgFVrJJfecnFHGPc.woff2"

# Download Poppins Medium 500
curl -o poppins-v20-latin-500.woff2 "https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLGT9Z1JlFc-K.woff2"

# Download Poppins SemiBold 600
curl -o poppins-v20-latin-600.woff2 "https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLEj6Z1JlFc-K.woff2"

# Download Poppins Bold 700
curl -o poppins-v20-latin-700.woff2 "https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLCz7Z1JlFc-K.woff2"

# Download Poppins ExtraBold 800
curl -o poppins-v20-latin-800.woff2 "https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLDD4Z1JlFc-K.woff2"

echo "Font files downloaded successfully!"
echo "Font files are now in public/fonts/"
