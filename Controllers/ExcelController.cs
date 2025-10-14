using Microsoft.AspNetCore.Mvc;
using ClosedXML.Excel;
using System.IO;
using DMS.Models;

namespace DMS.Controllers
{
    public class ExcelController : Controller
    {
        public const string SessionKeyName = "username";
        private readonly ILogger<ExcelController> _logger;
        private readonly IHttpContextAccessor contxt;

        private DMS_DbContext dataContext { get; set; }

        public ExcelController(ILogger<ExcelController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
        }
        public IActionResult GenerateExcel(long linkid, long subdepid)
        {
            var Fields = dataContext.Fields.Where(p => p.LinkID == linkid);
            var count = 0;
            // Create a new workbook
            using (var workbook = new XLWorkbook())
            {
                var excelSheet = workbook.Worksheets.Add("Sheet1");

                foreach (var field in Fields) 
                {
                    if (field.FieldNumber == -1)
                    {
                        excelSheet.Cell(1, 1).Value = field.Description;
                    }
                    else if (field.FieldNumber == 0)
                    {
                        excelSheet.Cell(1, 2).Value = field.Description;
                    }
                    else if (field.FieldNumber > 0 && field.FieldNumber < 11)
                    {
                        if (field.Active == true)
                        {
                            if (field.DataType == "Text")
                            {
                                excelSheet.Cell(1, field.FieldNumber + 2 + count).Value = field.Description;
                            }
                            else
                            {
                                excelSheet.Column(field.FieldNumber + 2 + count).Hide();
                            }

                            if (field.DataType == "Date")
                            {
                                excelSheet.Cell(1, field.FieldNumber + 3 + count).Value = field.Description;
                            }
                            else
                            {
                                excelSheet.Column(field.FieldNumber + 3 + count).Hide();
                            }
                        }
                        else
                        {
                            excelSheet.Column(field.FieldNumber + 2 + count).Hide();
                            excelSheet.Column(field.FieldNumber + 3 + count).Hide();
                        }

                        count++;
                    }
                }

                excelSheet.Cell(1, 23).Value = "Page Count";
                excelSheet.Cell(1, 24).Value = "Encoded By";

                // Set the content type and file name
                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var fileName = "SampleData.xlsx";

                    // Return the file as a download
                    return File(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
                }
            }
        }
    }
}
