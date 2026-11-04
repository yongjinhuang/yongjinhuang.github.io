#!/bin/bash

set -e

echo "Downloading Plus Jakarta Sans & JetBrains Mono font files..."

mkdir -p public/fonts
cd public/fonts
rm -f poppins-*.woff2

# Plus Jakarta Sans (400, 500, 600, 700, 800)
curl -sL -o plus-jakarta-sans-v12-latin-regular.woff2 "https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qU79TR_V.woff2"
curl -sL -o plus-jakarta-sans-v12-latin-500.woff2 "https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_m079TR_V.woff2"
curl -sL -o plus-jakarta-sans-v12-latin-600.woff2 "https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_d0n9TR_V.woff2"
curl -sL -o plus-jakarta-sans-v12-latin-700.woff2 "https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_Tkn9TR_V.woff2"
curl -sL -o plus-jakarta-sans-v12-latin-800.woff2 "https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_KUn9TR_V.woff2"

# JetBrains Mono (400, 500, 600, 700)
curl -sL -o jetbrains-mono-v24-latin-regular.woff2 "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxTOlOV.woff2"
curl -sL -o jetbrains-mono-v24-latin-500.woff2 "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxTOlOV.woff2"
curl -sL -o jetbrains-mono-v24-latin-600.woff2 "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8FqtTOlOV.woff2"
curl -sL -o jetbrains-mono-v24-latin-700.woff2 "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8L6tTOlOV.woff2"

echo "Font files downloaded successfully to public/fonts/!"
