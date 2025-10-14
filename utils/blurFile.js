const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Debug logging utility
const debug = (message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 ${message}`, data || '');
};

// Redact regions on image with black boxes
async function redactRegionsOnImage(imagePath, filename, outputPath, regions,redactiondir) {
  debug('Starting redaction process', { imagePath, filename, outputPath, regionsCount: regions.length });
  
  try {
    // Read the image file instead of using buffer
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    debug('Image metadata', { width: metadata.width, height: metadata.height, format: metadata.format });

    // Validate regions against image dimensions
    const validRegions = regions.filter(region => {
      const isValid = region.x >= 0 && region.y >= 0 && 
                     (region.x + region.width) <= metadata.width && 
                     (region.y + region.height) <= metadata.height;
      if (!isValid) {
        debug('Invalid region detected', region);
      }
      return isValid;
    });

    debug('Valid regions for redaction', { validCount: validRegions.length, totalCount: regions.length });

    if (validRegions.length === 0) {
      debug('No valid regions to redact, copying original image');
      await image.toFile(outputPath);
      return;
    }

    // Create black boxes for redaction
    const blackBoxes = validRegions.map(({ x, y, width, height }) => ({
      input: {
        create: {
          width: Math.max(1, width),
          height: Math.max(1, height),
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
        }
      },
      top: Math.max(0, Math.round(y)),
      left: Math.max(0, Math.round(x))
    }));

    debug('Applying redaction boxes', { boxCount: blackBoxes.length });
    await image.composite(blackBoxes).toFile(redactiondir);
    debug('Redaction completed successfully', { outputPath });

  } catch (error) {
    debug('Error in redaction process', { error: error.message, filename, imagePath });
    throw new Error(`Redaction failed for ${filename}: ${error}`);
  }
}

// Validate input parameters
function validateInputs(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions, filepathrelativetoserver) {
  debug('Validating inputs');
  
  const errors = [];
  
  if (!INPUT_PDF) errors.push('INPUT_PDF is required');
  if (!OUTPUT_PDF) errors.push('OUTPUT_PDF is required');
  if (!TEMP_DIR) errors.push('TEMP_DIR is required');
  if (!Array.isArray(blurRegions)) errors.push('blurRegions must be an array');
  if (!filepathrelativetoserver) errors.push('filepathrelativetoserver is required');
  
  if (errors.length > 0) {
    debug('Validation failed', { errors });
    throw new Error(`Validation errors: ${errors.join(', ')}`);
  }
  
  debug('Input validation passed');
}

// Get and sort page files
function getPageFiles(TEMP_DIR) {
  debug('Reading page files from directory', { TEMP_DIR });
  
  if (!fs.existsSync(TEMP_DIR)) {
    debug('Temp directory does not exist', { TEMP_DIR });
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

  debug('Found page files', { count: allPages.length, files: allPages });
  
  if (allPages.length === 0) {
    throw new Error('No PNG files found in temp directory');
  }
  
  return allPages;
}

// Process individual page
async function processPage(pageIndex, imgPath, filename, outputImgPath, blurRegions, filepathrelativetoserver,redactiondir) {
  // debug(`Processing page ${pageIndex + 1}`, { imgPath, outputImgPath });
  // console.log(blurRegions);
  
  try {
    // Filter regions for current page
    // const pageRegions = blurRegions
    // //   .filter(r => r.pageIndex === pageIndex)
    //   .map(r => ({
    //     x: Math.max(0, r.x),
    //     y: Math.max(0, r.y),
    //     width: Math.max(1, r.width),
    //     height: Math.max(1, r.height)
    //   }));

    const pageRegions = blurRegions.map(r => {
      if (r.restrictionType === "open") {
        return {
          x: Math.max(0, parseInt(r.xaxis, 10)),
          y: Math.max(0, parseInt(r.yaxis, 10)),
          width: Math.max(1, parseInt(r.width, 10)),
          height: Math.max(1, parseInt(r.height, 10))
        };
      } else {
        return {
          x: Math.max(0, r.x),
          y: Math.max(0, r.y),
          width: Math.max(1, r.width),
          height: Math.max(1, r.height)
        };
      }
    });


    debug(`Found regions for page ${pageIndex + 1}`, { regionCount: pageRegions.length });

    if (pageRegions.length > 0) {
      await redactRegionsOnImage(imgPath, filename, outputImgPath, pageRegions,redactiondir);
      const processedPath = `${filename}`;
      debug(`Page ${pageIndex + 1} processed with redaction`, { processedPath });
      return processedPath;
    } else {
      // No regions to redact, use original
      const originalPath = `${filepathrelativetoserver}/${path.basename(imgPath)}`;
      debug(`Page ${pageIndex + 1} processed without redaction`, { originalPath });
      return originalPath;
    }
  } catch (error) {
    debug(`Error processing page ${pageIndex + 1}`, { error: error.message });
    throw error;
  }
}

// Main function
async function bluritout(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions, filepathrelativetoserver,redactiondir) {
  // debug('Starting PDF redaction process');
  // debug('Input parameters', { 
  //   INPUT_PDF: typeof INPUT_PDF, 
  //   OUTPUT_PDF, 
  //   TEMP_DIR, 
  //   blurRegionsCount: blurRegions?.length,
  //   filepathrelativetoserver 
  // });

  try {
    // Validate inputs
    validateInputs(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions, filepathrelativetoserver);
    
    // Get page files
    const allPages = getPageFiles(TEMP_DIR);
    
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

    debug('All pages processed successfully', { 
      totalPages: allPages.length,
      processedImages: processedImages.length 
    });

    // Return the last processed image path (or modify as needed)
    const result = processedImages[processedImages.length - 1];
    debug('Process completed', { result });
    
    return result;

  } catch (error) {
    debug('Process failed', { error: error.message, stack: error.stack });
    throw new Error(`PDF redaction failed: ${error}`);
  }
}

module.exports = bluritout;