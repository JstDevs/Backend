const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Debug logging utility - only log errors by default
const DEBUG_ENABLED = process.env.DEBUG_REDACTION === 'true';
const debug = (message, data = null) => {
  if (DEBUG_ENABLED) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔍 ${message}`, data || '');
  }
};

// Helper function to safely parse coordinate values
function parseCoordinate(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  return isNaN(parsed) ? defaultValue : Math.max(defaultValue, parsed);
}

// Redact regions on image with black boxes
async function redactRegionsOnImage(imagePath, filename, outputPath, regions, redactiondir) {
  try {
    // Read the image file instead of using buffer
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    // Validate regions against image dimensions - filter out invalid ones early
    const validRegions = regions.filter(region => {
      // Check if coordinates are valid numbers
      if (isNaN(region.x) || isNaN(region.y) || isNaN(region.width) || isNaN(region.height)) {
        return false;
      }
      
      // Check bounds
      const isValid = region.x >= 0 && region.y >= 0 && 
                     region.width > 0 && region.height > 0 &&
                     (region.x + region.width) <= metadata.width && 
                     (region.y + region.height) <= metadata.height;
      return isValid;
    });

    // Early exit if no valid regions - skip file operations
    if (validRegions.length === 0) {
      return; // Don't copy file if no redaction needed
    }

    // Create black boxes for redaction
    const blackBoxes = validRegions.map(({ x, y, width, height }) => ({
      input: {
        create: {
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
        }
      },
      top: Math.max(0, Math.round(y)),
      left: Math.max(0, Math.round(x))
    }));

    await image.composite(blackBoxes).toFile(redactiondir);

  } catch (error) {
    console.error(`Error in redaction process for ${filename}:`, error.message);
    throw new Error(`Redaction failed for ${filename}: ${error}`);
  }
}

// Validate input parameters
function validateInputs(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions, filepathrelativetoserver) {
  const errors = [];
  
  if (!INPUT_PDF) errors.push('INPUT_PDF is required');
  if (!OUTPUT_PDF) errors.push('OUTPUT_PDF is required');
  if (!TEMP_DIR) errors.push('TEMP_DIR is required');
  if (!Array.isArray(blurRegions)) errors.push('blurRegions must be an array');
  if (!filepathrelativetoserver) errors.push('filepathrelativetoserver is required');
  
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`);
  }
}

// Get and sort page files
function getPageFiles(TEMP_DIR) {
  if (!fs.existsSync(TEMP_DIR)) {
    throw new Error(`Temp directory does not exist: ${TEMP_DIR}`);
  }

  const allPages = fs
    .readdirSync(TEMP_DIR)
    .filter(f => f.endsWith('.png'))
    .sort((a, b) => {
      // Natural sort for page ordering (page1.png, page2.png, etc.)
      const aNum = parseInt(a.match(/\d+/)?.[0] || '0');
      const bNum = parseInt(b.match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });
  
  if (allPages.length === 0) {
    throw new Error('No PNG files found in temp directory');
  }
  
  return allPages;
}

// Process individual page
async function processPage(pageIndex, imgPath, filename, outputImgPath, blurRegions, filepathrelativetoserver, redactiondir) {
  try {
    // Parse and validate regions - fix NaN issue
    const pageRegions = blurRegions
      .map(r => {
        let x, y, width, height;
        
        if (r.restrictionType === "open") {
          // Parse from string fields (xaxis, yaxis, etc.)
          x = parseCoordinate(r.xaxis);
          y = parseCoordinate(r.yaxis);
          width = parseCoordinate(r.width, 1);
          height = parseCoordinate(r.height, 1);
        } else {
          // Use direct numeric fields
          x = parseCoordinate(r.x);
          y = parseCoordinate(r.y);
          width = parseCoordinate(r.width, 1);
          height = parseCoordinate(r.height, 1);
        }
        
        return { x, y, width, height };
      })
      .filter(r => {
        // Filter out invalid regions early (NaN, zero dimensions, etc.)
        return !isNaN(r.x) && !isNaN(r.y) && 
               !isNaN(r.width) && !isNaN(r.height) &&
               r.width > 0 && r.height > 0;
      });

    // Early exit if no valid regions - skip file operations
    if (pageRegions.length === 0) {
      return `${filepathrelativetoserver}/${path.basename(imgPath)}`;
    }

    // Only process if we have valid regions
    await redactRegionsOnImage(imgPath, filename, outputImgPath, pageRegions, redactiondir);
    return filename;

  } catch (error) {
    console.error(`Error processing page ${pageIndex + 1}:`, error.message);
    throw error;
  }
}

// Main function
async function bluritout(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions, filepathrelativetoserver, redactiondir) {
  try {
    // Validate inputs
    validateInputs(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions, filepathrelativetoserver);
    
    // Get page files first (needed for both early exit and processing)
    const allPages = getPageFiles(TEMP_DIR);
    
    // Early exit optimization: Check if there are any potentially valid regions
    const hasValidRegions = blurRegions.some(r => {
      if (r.restrictionType === "open") {
        const x = parseCoordinate(r.xaxis);
        const y = parseCoordinate(r.yaxis);
        const w = parseCoordinate(r.width, 1);
        const h = parseCoordinate(r.height, 1);
        return !isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0;
      } else {
        const x = parseCoordinate(r.x);
        const y = parseCoordinate(r.y);
        const w = parseCoordinate(r.width, 1);
        const h = parseCoordinate(r.height, 1);
        return !isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0;
      }
    });

    // If no valid regions at all, return early without processing pages
    if (!hasValidRegions && blurRegions.length > 0) {
      debug('No valid regions found in blurRegions, skipping redaction');
      if (allPages.length > 0) {
        return `${filepathrelativetoserver}/${path.basename(allPages[allPages.length - 1])}`;
      }
    }
    
    // Process each page
    const processedImages = [];
    
    for (let i = 0; i < allPages.length; i++) {
      const imgPath = path.join(TEMP_DIR, allPages[i]);
      const filename = `blurred_${i}.png`;
      const outputImgPath = path.join(TEMP_DIR, filename);
      const redactionPath = path.join(redactiondir, filename);
      const processedPath = await processPage(
        i, 
        imgPath, 
        filename, 
        outputImgPath, 
        blurRegions, 
        filepathrelativetoserver,
        redactionPath
      );
      
      processedImages.push(processedPath);
    }

    // Return the last processed image path
    return processedImages[processedImages.length - 1];

  } catch (error) {
    console.error('PDF redaction failed:', error.message);
    throw new Error(`PDF redaction failed: ${error}`);
  }
}

module.exports = bluritout;