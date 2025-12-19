const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const multer = require('multer');
const db = require('../config/database'); // Adjust the path as needed
const { v4: uuidv4 } = require('uuid');
const { Poppler } = require('node-poppler');
async function convertPdfToImages(inputPdfPath, outputFolder) {
  
  // convertPdfBufferToImages(pdfBuffer, outputFolder);
 const poppler = new Poppler();
  const outputPath = path.join(outputFolder);
  //console.log("outputPath",outputPath)
  //console.log("inputPdfPath",inputPdfPath)

  const options = {
    pngFile: true,             // Equivalent to -png
    firstPageToConvert: 1,     // Equivalent to -f
    lastPageToConvert: 1,      // Equivalent to -l
    singleFile: false 
  };
  console.log("inputfilebuffer",inputPdfPath)
  try {
    const file=await poppler.pdfToCairo(inputPdfPath, outputPath, options);
    //console.log('PDF converted to image(s) successfully.',file);
  } catch (error) {
    console.error('Conversion failed:', error);
  }
}


async function convertPdfBufferToImages(pdfBuffer, outputFolder) {
  // //console.log("outputFolder",outputFolder)
      fs.mkdirSync(outputFolder, { recursive: true });
  //console.log("pdfBuffer",pdfBuffer,"outputFolder",outputFolder)
  const uuid=uuidv4()
  const tempPath = path.join(outputFolder, `${uuid}.pdf`);
  fs.writeFileSync(tempPath, pdfBuffer);
  const outputpath=path.join(outputFolder, `${uuid}`);
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }
  // Ensure outputpath directory exists
  if (!fs.existsSync(outputpath)) {
    fs.mkdirSync(outputpath, { recursive: true });
  }
  await convertPdfToImages(tempPath,outputpath);
  
  // Find the first PNG file that was created by poppler
  // Check both outputpath and outputFolder in case poppler writes to parent directory
  let imagePath = null;
  let filename = null;
  
  // First, try to find PNG files in outputpath
  try {
    if (fs.existsSync(outputpath)) {
      const files = fs.readdirSync(outputpath).filter(file => file.endsWith('.png'));
      if (files.length > 0) {
        filename = files[0];
        imagePath = path.join(outputpath, filename);
      }
    }
  } catch (err) {
    console.warn('Error reading outputpath directory:', err);
  }
  
  // If not found, check outputFolder (parent directory)
  if (!imagePath || !fs.existsSync(imagePath)) {
    try {
      if (fs.existsSync(outputFolder)) {
        const files = fs.readdirSync(outputFolder).filter(file => file.endsWith('.png') && file.includes(uuid));
        if (files.length > 0) {
          filename = files[0];
          imagePath = path.join(outputFolder, filename);
        }
      }
    } catch (err) {
      console.warn('Error reading outputFolder directory:', err);
    }
  }
  
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error(`PDF conversion failed: No PNG image file found in ${outputpath} or ${outputFolder}`);
  }
  
  const buffer = fs.readFileSync(imagePath);
  // fs.unlinkSync(tempPath); // optional cleanup
  // Ensure filename is just the basename, not the full path
  const fileBasename = path.basename(filename);
  console.log("filename",fileBasename,"imagePath",imagePath,"buffer length",buffer.length)
  return {
    file: fileBasename,
    buffer: buffer,
  }; // Return the buffer of the converted image
  
}

async function convertPdfBufferToMainFile(pdfBuffer, outputFolder) {
  // Make sure the output folder exists
  fs.mkdirSync(outputFolder, { recursive: true });

  // Create a unique file name
  const uuid = uuidv4();
  const filename = `${uuid}.pdf`;
  const filePath = path.join(outputFolder, filename);

  // Write the original PDF buffer to disk
  fs.writeFileSync(filePath, pdfBuffer);

  // Read it back into a buffer (optional, if you need to send it somewhere)
  const buffer = fs.readFileSync(filePath);

  console.log("PDF saved without conversion:", filename);
  

  // Return both filename and buffer
  return {
    file: filename,
    buffer: buffer,
  };
}


// async function convertPdfBufferToImages(pdfBuffer, outputFolder) {
//   fs.mkdirSync(outputFolder, { recursive: true });

//   const uuid = uuidv4();
//   const tempPath = path.join(outputFolder, `${uuid}.pdf`);
//   fs.writeFileSync(tempPath, pdfBuffer);

//   const outputPath = path.join(outputFolder, uuid);
//   fs.mkdirSync(outputPath, { recursive: true });

//   await convertPdfToImages(tempPath, outputPath);

//   // Find the first PNG file in the outputPath
//   const files = fs.readdirSync(outputPath).filter(file => file.endsWith('.png'));
//   let filename=null;
//   let buffer=null;
//   if (files.length === 0) {
//     // throw new Error(`No PNG images generated from PDF at ${outputPath}`);
//   }
//   else {
//     filename = files[0];
//     buffer = fs.readFileSync(path.join(outputPath, filename));
//   }

//   // fs.unlinkSync(tempPath); // optional cleanup

//   return {
//     file: filename,
//     buffer: buffer,
//   };
// }


// module.exports=convertPdfBufferToMainFile;
module.exports=convertPdfBufferToImages;