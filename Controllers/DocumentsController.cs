using DMS.Models;
using DocumentFormat.OpenXml.Office2010.Excel;
using DocumentFormat.OpenXml.Wordprocessing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System.Diagnostics;
using System.Net.Mail;
namespace DMS.Controllers
{
    public class DocumentsController : Controller
    {
        public const string SessionKeyName = "username";
        public string sql;
        private readonly ILogger<DocumentsController> _logger;
        private readonly IHttpContextAccessor contxt;
        private readonly GlobalMethods _globalMethods;
        private readonly IWebHostEnvironment _webHostEnvironment;

     

        private DMS_DbContext dataContext { get; set; }

        public DocumentsController(ILogger<DocumentsController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor, GlobalMethods globalMethods, IWebHostEnvironment webHostEnvironment)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
            _globalMethods = globalMethods;
            _webHostEnvironment = webHostEnvironment;
        }

        public IActionResult Index()
        {
            var newSubDep = TempData["assSubDep"] as string;

            if (newSubDep != null && TempData["id"] != null && newSubDep != "[]")
            {
                TempData["departments"] = dataContext.Department.Where(p => p.Active == true).ToList();
                TempData["subdepartments"] = JsonConvert.DeserializeObject<List<SubDepartmentModel>>(newSubDep);
                var id = long.Parse(TempData["id"].ToString());
                var subid = long.Parse(TempData["subid"].ToString());
                var department = dataContext.Department.FirstOrDefault(p => p.Active == true && p.ID == (int)id);

                if (subid != 0)
                {
                    var documents = dataContext.AssignSubdepartment.FirstOrDefault(p => p.DepartmentID == (int)id && p.SubDepartmentID == subid && p.Active == true);
                    var subdepartment = dataContext.SubDepartment.FirstOrDefault(p => p.ID == subid);

                    LoadDocuments(documents != null ? documents.LinkID : 0);
                    ViewBag.department = department.Name;
                    ViewBag.id = id;
                    ViewBag.subid = subdepartment.ID;
                    ViewBag.subdepartment = subdepartment.Name;

                    return View();
                }
                else
                {
                    var subdepartment = JsonConvert.DeserializeObject<List<SubDepartmentModel>>(newSubDep);

                    var documents = dataContext.AssignSubdepartment.FirstOrDefault(p => p.DepartmentID == (int)id && p.SubDepartmentID == subdepartment[0].ID && p.Active == true);

                    LoadDocuments(documents != null ? documents.LinkID : 0);
                    ViewBag.department = department.Name;
                    ViewBag.id = id;
                    ViewBag.subid = subdepartment[0].ID;
                    ViewBag.subdepartment = subdepartment[0].Name;

                    return View();
                }
            }

            return RedirectToAction("Department");
        }

        public IActionResult Department(int id, long subid)
        {
            if (id != 0)
            {   
                LoadSubDepartment(id, subid);
                return RedirectToAction("Index");
            }
            else
            {
                var departments = dataContext.AssignSubdepartment.Where(p => p.Active == true).ToList();
                LoadSubDepartment(departments[0].DepartmentID, 0);
                return RedirectToAction("Index");
            }
        }

        public void LoadSubDepartment(long id, long subid)
        {
            List<SubDepartmentModel> newsubdept = new List<SubDepartmentModel>();

            var department = dataContext.Department.FirstOrDefault(p => p.ID == id);
            string departmentName = department != null ? department.Name : "Unknown";

            var subdepartment = dataContext.SubDepartment.Where(p => p.Active == true).ToList();
            var assignSubDep = dataContext.AssignSubdepartment.Where(p => p.DepartmentID == id && p.Active == true).ToList();

            for (var i = 0; i < assignSubDep.Count; i++)
            {
                for (var j = 0; j < subdepartment.Count; j++)
                {
                    if (assignSubDep[i].SubDepartmentID == subdepartment[j].ID)
                        newsubdept.Add(subdepartment[j]);
                }
            }

            TempData["id"] = id.ToString();
            TempData["assSubDep"] = JsonConvert.SerializeObject(newsubdept);
            TempData["subid"] = subid.ToString();


            var selectedSubDep = newsubdept.FirstOrDefault(s => s.ID == subid);
            string subdepartmentName = selectedSubDep != null ? selectedSubDep.Name : "None";

            TempData["depid"] = id.ToString();
            TempData["depname"] = departmentName;
            TempData["subdepid"] = subid.ToString();
            TempData["subdepname"] = subdepartmentName;
            TempData.Keep();



        }

        public void LoadDocuments(long linkid)
        {
            TempData["documents"] = dataContext.Documents.Where(p => p.LinkID == linkid && p.Active == true);
            TempData["linkid"] = linkid.ToString();
        }

   

        public IActionResult Edit()
        {

            if (TempData["linkid"] != null)
            {
                if (TempData["Alert"] != null)
                {
                    ViewBag.alert = TempData["Alert"];
                }
                long linkid = long.Parse(TempData["linkid"].ToString());
                long id = long.Parse(TempData["id"].ToString());

                var fields = dataContext.Fields.Where(p => p.LinkID == linkid && p.Active == true).ToList();
                var selectedDocument = dataContext.Documents.FirstOrDefault(p => p.ID == id && p.LinkID == linkid && p.Active == true);
                string depname = TempData["depname"].ToString();
                string subdepname = TempData["subdepname"].ToString();
                TempData["fields"] = fields;
                TempData["document"] = selectedDocument;
                ViewBag.depname = depname;
                ViewBag.subdepname = subdepname;
                ViewBag.linkid = TempData["linkid"];
                ViewBag.id = TempData["id"];



                var attachments = dataContext.Attachment
                                 .Where(a => a.LinkID == id)
                                 .ToList();

                ViewBag.Attachments = attachments;


                return View();
            }
            else
            { 
                return RedirectToAction("Index");
            }
             
        }

        public IActionResult ViewDocument()
        {

            if (TempData["linkid"] != null)
            {
                if (TempData["Alert"] != null)
                {
                    ViewBag.alert = TempData["Alert"];
                }
                long linkid = long.Parse(TempData["linkid"].ToString());
                long id = long.Parse(TempData["id"].ToString());

                var fields = dataContext.Fields.Where(p => p.LinkID == linkid && p.Active == true).ToList();
                var selectedDocument = dataContext.Documents.FirstOrDefault(p => p.ID == id && p.LinkID == linkid && p.Active == true);
                string depname = TempData["depname"].ToString();
                string subdepname = TempData["subdepname"].ToString();
                TempData["fields"] = fields;
                TempData["document"] = selectedDocument;
                ViewBag.depname = depname;
                ViewBag.subdepname = subdepname;
                ViewBag.linkid = TempData["linkid"];
                ViewBag.id = TempData["id"];



                var attachments = dataContext.Attachment
                                 .Where(a => a.LinkID == id)
                                 .ToList();

                ViewBag.Attachments = attachments;



                return View();
            }
            else
            {
                return RedirectToAction("Index");
            }

        }



        public IActionResult EditDocument(long linkid, long id, string depname, string subdepname)
        {
            TempData["id"] = id.ToString();
            TempData["linkid"] = linkid.ToString();
            TempData["depname"] = depname;
            TempData["subdepname"] = subdepname;
            return RedirectToAction("Edit");
        }

        public IActionResult CreateDocument(long depidm, long subdepid, string depname, string subdepname)
        {
            return RedirectToAction("Create");
        }

        public IActionResult ViewDocuments(long linkid, long id, string depname, string subdepname)
        {
            TempData["id"] = id.ToString();
            TempData["linkid"] = linkid.ToString();
            TempData["depname"] = depname;
            TempData["subdepname"] = subdepname;
            return RedirectToAction("ViewDocument");
        }


       



        [HttpPost]
        public IActionResult Edit(string InputValue)
        {
            try
            {
                // Retrieve form values
                var filename = Request.Form["filename"].ToString();
                var filedate = Request.Form["filedate"].ToString();
                var text1 = Request.Form["Text1"].ToString();
                var date1 = Request.Form["Date1"].ToString();
                var text2 = Request.Form["Text2"].ToString();
                var date2 = Request.Form["Date2"].ToString();
                var text3 = Request.Form["Text3"].ToString();
                var date3 = Request.Form["Date3"].ToString();
                var text4 = Request.Form["Text4"].ToString();
                var date4 = Request.Form["Date4"].ToString();
                var text5 = Request.Form["Text5"].ToString();
                var date5 = Request.Form["Date5"].ToString();
                var text6 = Request.Form["Text6"].ToString();
                var date6 = Request.Form["Date6"].ToString();
                var text7 = Request.Form["Text7"].ToString();
                var date7 = Request.Form["Date7"].ToString();
                var text8 = Request.Form["Text8"].ToString();
                var date8 = Request.Form["Date8"].ToString();
                var text9 = Request.Form["Text9"].ToString();
                var date9 = Request.Form["Date9"].ToString();
                var text10 = Request.Form["Text10"].ToString();
                var date10 = Request.Form["Date10"].ToString();
                var expirationChecked = Request.Form["expiration"] == "true";
                var confidential = Request.Form["confidential"] == "true";
                var expdate = Request.Form["expdate"].ToString();
                var remarks = Request.Form["remarks"].ToString();
                var linkid = Request.Form["linkid"].ToString();
                var id = Request.Form["id"].ToString();
                var depname = Request.Form["depname"].ToString();
                var subdepname = Request.Form["subdepname"].ToString();

                // Validate expiration date only if the checkbox is checked
                if (expirationChecked)
                {
                    if (!DateTime.TryParse(expdate, out DateTime parsedExpDate) || parsedExpDate <= DateTime.Now)
                    {
                        TempData["Alert"] = "<span class='text-danger'>Please Enter a Valid Expiration Date</span>";
                        TempData["id"] = id;
                        TempData["linkid"] = linkid;
                        TempData["depname"] = depname;
                        TempData["subdepname"] = subdepname;
                        return RedirectToAction("Edit");
                    }
                }

                DateTime? fileDate = DateTime.TryParse(filedate, out DateTime parsedFileDate) ? (DateTime?)parsedFileDate : null;

                var record = dataContext.Documents.Find(long.Parse(id)); 
                if (record == null)
                {
                    TempData["Alert"] = "<span class='text-danger'>Record not found.</span>";
                    TempData["id"] = id;
                    TempData["linkid"] = linkid;
                    TempData["depname"] = depname;
                    TempData["subdepname"] = subdepname;
                    return RedirectToAction("Edit");
                }

                record.FileName = filename;
                record.FileDate = fileDate;
                record.Text1 = text1;
                record.Date1 = DateTime.TryParse(date1, out DateTime parsedDate1) ? (DateTime?)parsedDate1 : null;
                record.Text2 = text2;
                record.Date2 = DateTime.TryParse(date2, out DateTime parsedDate2) ? (DateTime?)parsedDate2 : null;
                record.Text3 = text3;
                record.Date3 = DateTime.TryParse(date3, out DateTime parsedDate3) ? (DateTime?)parsedDate3 : null;
                record.Text4 = text4;
                record.Date4 = DateTime.TryParse(date4, out DateTime parsedDate4) ? (DateTime?)parsedDate4 : null;
                record.Text5 = text5;
                record.Date5 = DateTime.TryParse(date5, out DateTime parsedDate5) ? (DateTime?)parsedDate5 : null;
                record.Text6 = text6;
                record.Date6 = DateTime.TryParse(date6, out DateTime parsedDate6) ? (DateTime?)parsedDate6 : null;
                record.Text7 = text7;
                record.Date7 = DateTime.TryParse(date7, out DateTime parsedDate7) ? (DateTime?)parsedDate7 : null;
                record.Text8 = text8;
                record.Date8 = DateTime.TryParse(date8, out DateTime parsedDate8) ? (DateTime?)parsedDate8 : null;
                record.Text9 = text9;
                record.Date9 = DateTime.TryParse(date9, out DateTime parsedDate9) ? (DateTime?)parsedDate9 : null;
                record.Text10 = text10;
                record.Date10 = DateTime.TryParse(date10, out DateTime parsedDate10) ? (DateTime?)parsedDate10 : null;
                record.Expiration = expirationChecked;
                record.Confidential = confidential;
                record.ExpirationDate = DateTime.Parse(expdate);
                record.Remarks = remarks;

                dataContext.SaveChanges();

                TempData["Alert"] = "<span class='text-success'>Data updated successfully.</span>";
                TempData["id"] = id;
                TempData["linkid"] = linkid;
                TempData["depname"] = depname;
                TempData["subdepname"] = subdepname;
                return RedirectToAction("Edit");
            }
            catch (FormatException ex)
            {
                TempData["Alert"] = $"<span class='text-danger'>Error: {ex.Message}</span>";
                return RedirectToAction("Edit");
            }
            catch (Exception ex)
            {
                TempData["Alert"] = $"<span class='text-danger'>Unexpected Error: {ex.Message}</span>";
                return RedirectToAction("Edit");
            }
        }









        [HttpPost]
        public async Task<IActionResult> UploadFiles(IFormFile[] attach_files, long attachmentIDs)
        {
            if (attach_files == null || attach_files.Length == 0)
            {
                return BadRequest("No files uploaded.");
            }

            if (attachmentIDs == 0)
            {
                return BadRequest("Invalid LinkID.");
            }

            try
            {
                foreach (var file in attach_files)
                {
                    if (file.Length > 0)
                    {
                        // Read the file content into a byte array
                        using var memoryStream = new MemoryStream();
                        await file.CopyToAsync(memoryStream);
                        var fileBytes = memoryStream.ToArray();

                        // Get the file extension (e.g., .pdf, .jpg, .xlsx)
                        string fileExtension = Path.GetExtension(file.FileName).ToLower();  // Ensures the extension is in lowercase

                        // Define the raw SQL query
                        var sql = "INSERT INTO Attachment ([Link ID], [Data Image], [Data Name], [Data Type]) " +
                                  "VALUES (@LinkID, @DataImage, @DataName, @DataType)";

                        // Execute the raw SQL query
                        await dataContext.Database.ExecuteSqlRawAsync(sql,
                            new SqlParameter("@LinkID", attachmentIDs),
                            new SqlParameter("@DataImage", fileBytes ?? (object)DBNull.Value),
                            new SqlParameter("@DataName", file.FileName),
                            new SqlParameter("@DataType", fileExtension));  // Store the file extension
                    }
                }

                return Ok(new { message = "Files uploaded successfully!" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
                Console.WriteLine($"Inner Exception: {ex.InnerException?.Message}");
                return StatusCode(500, "An error occurred while saving the data.");
            }
        }




        [HttpPost]
        public async Task<IActionResult> DeleteAttachment(long attachmentID)
        {
            if (attachmentID == 0)
            {
                return BadRequest("Invalid attachment ID.");
            }

            try
            {
                var attachment = await dataContext.Attachment
                    .FirstOrDefaultAsync(a => a.ID == attachmentID);

                if (attachment == null)
                {
                    return NotFound("Attachment not found.");
                }

                dataContext.Attachment.Remove(attachment);
                await dataContext.SaveChangesAsync();

                return Ok(new { message = "Attachment deleted successfully!" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
                return StatusCode(500, "An error occurred while deleting the attachment.");
            }
        }


        [HttpGet]
        public IActionResult GetAttachments(long attachmentIDs)
        {
            var attachments = dataContext.Attachment
                .Where(a => a.LinkID == attachmentIDs)
                .Select(a => new
                {
                    id = a.ID,
                    dataName = a.DataName,
                    dataType = a.DataType
                })
                .ToList();

            return Json(attachments);
        }












        public IActionResult ConvertToPdfA(long attachmentID)
        {
            var attachment = dataContext.Attachment
                .FirstOrDefault(a => a.ID == attachmentID);

            if (attachment == null || attachment.DataImage == null)
            {
                TempData["Error"] = "Attachment not found or invalid.";
                return RedirectToAction("Index");
            }

            try
            {
                string ghostscriptPath = @"C:\Program Files\gs\gs10.04.0\bin\gswin64c.exe";
                if (!System.IO.File.Exists(ghostscriptPath))
                {
                    TempData["Error"] = "Ghostscript is not installed or not found at the specified path.";
                    return RedirectToAction("Index");
                }

                string tempInputPath = Path.GetTempFileName();
                System.IO.File.WriteAllBytes(tempInputPath, attachment.DataImage);

                using (var memoryStream = new MemoryStream())
                {
                    string tempOutputPath = Path.GetTempFileName();

                    try
                    {
                        string ghostscriptCommand = $"-dPDFA=1 " +
                                                     "-dPDFACompatibilityPolicy=1 " +
                                                     "-dCompatibilityLevel=1.4 " +
                                                     "-sDEVICE=pdfwrite " +
                                                     "-dBATCH " +
                                                     "-dNOPAUSE " +
                                                     "-sColorConversionStrategy=UseDeviceIndependentColor " +
                                                     "-dPDFSETTINGS=/default " +
                                                     "-dNOOUTERSAVE " +
                                                     "-dNOSAFER " +
                                                     $"-sOutputFile=\"{tempOutputPath}\" " +
                                                     $"\"{tempInputPath}\"";

                        using (var process = new Process())
                        {
                            process.StartInfo.FileName = ghostscriptPath;
                            process.StartInfo.Arguments = ghostscriptCommand;
                            process.StartInfo.UseShellExecute = false;
                            process.StartInfo.RedirectStandardOutput = true;
                            process.StartInfo.RedirectStandardError = true;
                            process.StartInfo.CreateNoWindow = true;

                            process.Start();
                            process.WaitForExit();

                            int exitCode = process.ExitCode;
                            if (exitCode != 0 || !System.IO.File.Exists(tempOutputPath))
                            {
                                Debug.WriteLine($"Ghostscript failed with exit code {exitCode}");
                                TempData["Error"] = "Failed to convert the file to PDF/A format.";
                                return RedirectToAction("Index");
                            }
                        }

                        byte[] convertedBytes = System.IO.File.ReadAllBytes(tempOutputPath);
                        memoryStream.Write(convertedBytes, 0, convertedBytes.Length);
                    }
                    finally
                    {
                        if (System.IO.File.Exists(tempInputPath))
                            System.IO.File.Delete(tempInputPath);

                        if (System.IO.File.Exists(tempOutputPath))
                            System.IO.File.Delete(tempOutputPath);
                    }

                    memoryStream.Position = 0;

                    // Construct the file name
                    string fileName = $"{Path.GetFileNameWithoutExtension(attachment.DataName)} (PDF/A).pdf";

                    return File(memoryStream.ToArray(), "application/pdf", fileName);
                }
            }
            catch (Exception ex)
            {
                TempData["Error"] = $"An error occurred during the conversion: {ex.Message}";
                return RedirectToAction("Index");
            }
        }





        public IActionResult Create()
        {
            return RedirectToAction("Index");

            if (TempData["linkid"] != null)
            {
                if (TempData["Alert"] != null)
                {
                    ViewBag.alert = TempData["Alert"];
                }
                long linkid = long.Parse(TempData["linkid"].ToString());

                var fields = dataContext.Fields.Where(p => p.LinkID == linkid && p.Active == true).ToList();

                string depname = TempData["depname"].ToString();
                string subdepname = TempData["subdepname"].ToString();
                TempData["fields"] = fields;
                ViewBag.depname = depname;
                ViewBag.subdepname = subdepname;
                ViewBag.linkid = TempData["linkid"];


                return View();
            }
            else
            {
                return RedirectToAction("Index");
            }

        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Create(string InputValue)
        {
            try
            {
                // Retrieve form values
                var filename = Request.Form["filename"].ToString();
                var filedate = Request.Form["filedate"].ToString();
                var text1 = Request.Form["Text1"].ToString();
                var date1 = Request.Form["Date1"].ToString();
                var text2 = Request.Form["Text2"].ToString();
                var date2 = Request.Form["Date2"].ToString();
                var text3 = Request.Form["Text3"].ToString();
                var date3 = Request.Form["Date3"].ToString();
                var text4 = Request.Form["Text4"].ToString();
                var date4 = Request.Form["Date4"].ToString();
                var text5 = Request.Form["Text5"].ToString();
                var date5 = Request.Form["Date5"].ToString();
                var text6 = Request.Form["Text6"].ToString();
                var date6 = Request.Form["Date6"].ToString();
                var text7 = Request.Form["Text7"].ToString();
                var date7 = Request.Form["Date7"].ToString();
                var text8 = Request.Form["Text8"].ToString();
                var date8 = Request.Form["Date8"].ToString();
                var text9 = Request.Form["Text9"].ToString();
                var date9 = Request.Form["Date9"].ToString();
                var text10 = Request.Form["Text10"].ToString();
                var date10 = Request.Form["Date10"].ToString();
                var expirationChecked = Request.Form["expiration"] == "true";
                var confidential = Request.Form["confidential"] == "true";
                var expdate = Request.Form["expdate"].ToString();
                var remarks = Request.Form["remarks"].ToString();
                var linkid = Request.Form["linkid"].ToString();
                var id = Request.Form["id"].ToString();
                var depname = Request.Form["depname"].ToString();
                var subdepname = Request.Form["subdepname"].ToString();

                // Validate expiration date only if the checkbox is checked
                if (expirationChecked)
                {
                    if (!DateTime.TryParse(expdate, out DateTime parsedExpDate) || parsedExpDate <= DateTime.Now)
                    {
                        TempData["Alert"] = "<span class='text-danger'>Please Enter a Valid Expiration Date</span>";
                        TempData["id"] = id;
                        TempData["linkid"] = linkid;
                        TempData["depname"] = depname;
                        TempData["subdepname"] = subdepname;
                        return RedirectToAction("Edit");
                    }
                }

                DateTime? fileDate = DateTime.TryParse(filedate, out DateTime parsedFileDate) ? (DateTime?)parsedFileDate : null;

                var record = dataContext.Documents.Find(long.Parse(id));
                if (record == null)
                {
                    TempData["Alert"] = "<span class='text-danger'>Record not found.</span>";
                    TempData["id"] = id;
                    TempData["linkid"] = linkid;
                    TempData["depname"] = depname;
                    TempData["subdepname"] = subdepname;
                    return RedirectToAction("Edit");
                }

                record.FileName = filename;
                record.FileDate = fileDate;
                record.Text1 = text1;
                record.Date1 = DateTime.TryParse(date1, out DateTime parsedDate1) ? (DateTime?)parsedDate1 : null;
                record.Text2 = text2;
                record.Date2 = DateTime.TryParse(date2, out DateTime parsedDate2) ? (DateTime?)parsedDate2 : null;
                record.Text3 = text3;
                record.Date3 = DateTime.TryParse(date3, out DateTime parsedDate3) ? (DateTime?)parsedDate3 : null;
                record.Text4 = text4;
                record.Date4 = DateTime.TryParse(date4, out DateTime parsedDate4) ? (DateTime?)parsedDate4 : null;
                record.Text5 = text5;
                record.Date5 = DateTime.TryParse(date5, out DateTime parsedDate5) ? (DateTime?)parsedDate5 : null;
                record.Text6 = text6;
                record.Date6 = DateTime.TryParse(date6, out DateTime parsedDate6) ? (DateTime?)parsedDate6 : null;
                record.Text7 = text7;
                record.Date7 = DateTime.TryParse(date7, out DateTime parsedDate7) ? (DateTime?)parsedDate7 : null;
                record.Text8 = text8;
                record.Date8 = DateTime.TryParse(date8, out DateTime parsedDate8) ? (DateTime?)parsedDate8 : null;
                record.Text9 = text9;
                record.Date9 = DateTime.TryParse(date9, out DateTime parsedDate9) ? (DateTime?)parsedDate9 : null;
                record.Text10 = text10;
                record.Date10 = DateTime.TryParse(date10, out DateTime parsedDate10) ? (DateTime?)parsedDate10 : null;
                record.Expiration = expirationChecked;
                record.Confidential = confidential;
                record.ExpirationDate = DateTime.Parse(expdate);
                record.Remarks = remarks;

                dataContext.SaveChanges();

                TempData["Alert"] = "<span class='text-success'>Data updated successfully.</span>";
                TempData["id"] = id;
                TempData["linkid"] = linkid;
                TempData["depname"] = depname;
                TempData["subdepname"] = subdepname;
                return RedirectToAction("Edit");
            }
            catch (FormatException ex)
            {
                TempData["Alert"] = $"<span class='text-danger'>Error: {ex.Message}</span>";
                return RedirectToAction("Edit");
            }
            catch (Exception ex)
            {
                TempData["Alert"] = $"<span class='text-danger'>Unexpected Error: {ex.Message}</span>";
                return RedirectToAction("Edit");
            }
        }






    }
}
