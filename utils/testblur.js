const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { convert } = require('pdf-poppler');
const pdf2pic = require('pdf2pic');

const INPUT_PDF = 'input.pdf';
const OUTPUT_PDF = 'output_blurred.pdf';
const TEMP_DIR = 'temp_blur_pages';

const blurRegions = [
  // === COORDS OF REGIONS TO BLUR ===
  // Format: pageIndex starts from 0
  { pageIndex: 0, x: 100, y: 150, width: 200, height: 50 },
  { pageIndex: 1, x: 50, y: 100, width: 250, height: 40 },
  { pageIndex: 2, x: 100, y: 150, width: 200, height: 50 },
  { pageIndex: 3, x: 50, y: 100, width: 250, height: 40 },
  { pageIndex: 4, x: 100, y: 150, width: 200, height: 50 },
  { pageIndex: 5, x: 50, y: 100, width: 250, height: 40 },
];

// Step 1: Convert PDF pages to PNG images
async function convertPdfToImages(inputPdf, outputFolder) {
  if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);

    const options = {
        density: 100,
        saveFilename: 'test',
        savePath: outputFolder,
        format: 'png',
        width: 600,
        height: 800,
      };

      const converter = pdf2pic.fromPath(inputPdf, options);
      await converter(1); // Convert the first page


  
}

// Step 2: Blur specified regions
async function blurRegionsOnImage(imagePath, outputPath, regions) {
  const image = sharp(imagePath);
  const overlays = await Promise.all(
    regions.map(async ({ x, y, width, height }) => ({
      input: await sharp(imagePath)
        .extract({ left: x, top: y, width, height })
        .blur(10)
        .toBuffer(),
      top: y,
      left: x,
    }))
  );
  await image.composite(overlays).toFile(outputPath);
}
async function redactRegionsOnImage(imagePath, outputfile,outputPath, regions) {
  console.log('🔍 Redacting regions on image:', imagePath,"outputpath====>",outputPath,"<=======regions",regions);

  const image = sharp(imagePath);
  const metadata = await image.metadata();

  const blackBoxes = regions.map(({ x, y, width, height }) => ({
    input: {
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 0, b: 0 }, // solid black
      },
    },
    top: y,
    left: x,
  }));
  console.log("outputfile",outputfile);

  await image.composite(blackBoxes).toFile(outputPath);
}

// Step 3: Combine blurred images into a PDF
async function createPdfFromImages(imagePaths, outputPdfPath) {
  const pdfDoc = await PDFDocument.create();

  for (const imgPath of imagePaths) {
    const imgBytes = fs.readFileSync(imgPath);
    const image = await pdfDoc.embedPng(imgBytes);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, pdfBytes);
}

// Main function
async function bluritout(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions) {
  console.log('📄 Starting PDF blurring process...');
  // console.log(INPUT_PDF, OUTPUT_PDF, TEMP_DIR, blurRegions);
  try {
    console.log('📄 Converting PDF to images...');
    // await convertPdfToImages(INPUT_PDF, TEMP_DIR);

    const allPages = fs
      .readdirSync(TEMP_DIR)
      .filter(f => f.endsWith('.png'))
      .sort(); // Ensure proper order
    console.log(`📄 Found ${allPages.length} pages.`);
    const processedImages = [];
    console.log(`📄 Found ${allPages.length} pages.`);
    for (let i = 0; i < allPages.length; i++) {
      const imgPath = path.join(TEMP_DIR, allPages[i]);
      const filename=`blurred_${i}.png`
      const outputImgPath = path.join(TEMP_DIR, filename);
      const pageRegions = blurRegions.map(r => {
      return {
          x: r.x,
        y: r.y,
        width: r.width,
        height: r.height
      }
      });

      if (pageRegions.length) {
        console.log(`🟦 Blurring page ${i + 1}...`);
        // await blurRegionsOnImage(imgPath, outputImgPath, pageRegions);
        await redactRegionsOnImage(INPUT_PDF, filename,outputImgPath, pageRegions);

        processedImages.push(filename);
      } else {
        processedImages.push(imgPath); // Use original if no blur
      }
    }

    console.log('📦 Creating final PDF...',processedImages);
    // await createPdfFromImages(processedImages, TEMP_DIR);

    // console.log(`✅ Done. Blurred PDF saved as: ${OUTPUT_PDF}`);
    return processedImages[processedImages.length - 1];
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

module.exports = bluritout;
