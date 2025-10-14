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
    pngFile: true,              // Equivalent to -png
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
  await convertPdfToImages(tempPath,outputpath);
  // //console.log("tempPath===========>",tempPath,"<==============", "outputpath==========>",outputpath,"<==============>",outputFolder,"<==============>")
  const filename=`${uuid}-1.png`
  // //console.log("file",filename,"path",outputFolder+`/${filename}`)
  const buffer= fs.readFileSync(outputFolder+`/${filename}`);
  // fs.unlinkSync(tempPath); // optional cleanup
  console.log("filename",filename,"buffer",buffer)
  return {
    file:filename,
    buffer: buffer,
  }; // Return the buffer of the converted image
  
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


module.exports=convertPdfBufferToImages