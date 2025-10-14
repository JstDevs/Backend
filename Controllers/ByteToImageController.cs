using DMS.Models;
using Microsoft.AspNetCore.Mvc;
using ClosedXML.Excel;

namespace DMS.Controllers
{
    public class ByteToImageController : Controller
    {
        public const string SessionKeyName = "username";
        public string sql;
        private readonly ILogger<ByteToImageController> _logger;
        private readonly IHttpContextAccessor contxt;

        private readonly IWebHostEnvironment _hostingEnvironment;

        private DMS_DbContext dataContext { get; set; }

        public ByteToImageController(ILogger<ByteToImageController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor, IWebHostEnvironment hostingEnvironment)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
            _hostingEnvironment = hostingEnvironment;
        }

        // Replace with your data access method
        public IActionResult GetImage(int id)
        {
            var selectedUser = dataContext.LGU.FirstOrDefault(p => p.ID == id);

            if (selectedUser.Logo == null || selectedUser.Logo == null)
            {
                return NotFound(); // Handle not found
            }

            return File(selectedUser.Logo, "image/jpeg"); // Use the correct content type
        }

        public IActionResult ViewPdf(long linkid)
        {
            var attachment = dataContext.Attachment.FirstOrDefault(p => p.ID == linkid);

            if (attachment != null)
            {

                var pdfData = attachment.DataImage;
                return File(pdfData, "application/pdf");
            }
            return NotFound(); // Handle not found case
        }




        //preview excel

        //public IActionResult ViewPdf(long linkid)
        //{
        //    var attachment = dataContext.Attachment.FirstOrDefault(p => p.ID == linkid);

        //    if (attachment != null)
        //    {
        //        if (attachment.DataType == ".xlsx")
        //        {
        //            return File(attachment.DataImage, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", attachment.DataName);
        //        }
        //        else if (attachment.DataType == ".pdf" || attachment.DataType == ".docx")
        //        {
        //            return File(attachment.DataImage, "application/pdf");
        //        }
        //    }
        //    return NotFound(); // Handle not found case
        //}


        //private byte[] ConvertExcelToPdf(byte[] excelData)
        //{
        //    using (var excelStream = new MemoryStream(excelData))
        //    using (var pdfStream = new MemoryStream())
        //    {
        //        // Assuming Aspose.Cells is used here
        //        var workbook = new Aspose.Cells.Workbook(excelStream);
        //        workbook.Save(pdfStream, Aspose.Cells.SaveFormat.Pdf);
        //        return pdfStream.ToArray();
        //    }
        //}





    }
}
