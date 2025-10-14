using DMS.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DMS.Controllers
{
    public class LGUMaintenanceController : Controller
    {
        public const string SessionKeyName = "username";
        public string sql;
        private readonly ILogger<LGUMaintenanceController> _logger;
        private readonly IHttpContextAccessor contxt;
        private readonly GlobalMethods _globalMethods;

        private DMS_DbContext dataContext { get; set; }

        public LGUMaintenanceController(ILogger<LGUMaintenanceController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor, GlobalMethods globalMethods)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
            _globalMethods = globalMethods;
        }

        public IActionResult Index()
        {
            var selectedUser = dataContext.LGU.FirstOrDefault();
            var brgy = dataContext.Barangay.FirstOrDefault(p => p.ID == selectedUser.BarangayID);
            var mncplty = dataContext.Municipality.FirstOrDefault(p => p.ID == selectedUser.MunicipalityID);
            var rgn = dataContext.Region.FirstOrDefault(p => p.ID == selectedUser.RegionID);

            ViewBag.id = selectedUser.ID;
            ViewBag.name = selectedUser.Name;
            ViewBag.tin = selectedUser.TIN;
            ViewBag.code = selectedUser.Code;
            ViewBag.rdo = selectedUser.RDO;
            ViewBag.staddress = selectedUser.StreetAddress;
            ViewBag.brgy = brgy.Name;
            ViewBag.municipality = mncplty.Name;
            ViewBag.region = rgn.Name;
            ViewBag.zipcode = selectedUser.ZipCode;
            ViewBag.phone = selectedUser.PhoneNumber;
            ViewBag.email = selectedUser.EmailAddress;
            ViewBag.website = selectedUser.Website;
            return View();
        }

        public IActionResult Edit()
        {
            if (TempData["alert"] != null)
                ViewBag.alert = TempData["alert"];

            var selectedUser = dataContext.LGU.FirstOrDefault();
            var brgy = dataContext.Barangay.FirstOrDefault(p => p.ID == selectedUser.BarangayID);
            var mncplty = dataContext.Municipality.FirstOrDefault(p => p.ID == selectedUser.MunicipalityID);
            var rgn = dataContext.Region.FirstOrDefault(p => p.ID == selectedUser.RegionID);
            TempData["barangay"] = dataContext.Barangay.Where(p => p.Active == true).ToList();
            TempData["municipality"] = dataContext.Municipality.Where(p => p.Active == true).ToList();
            TempData["region"] = dataContext.Region.Where(p => p.Active == true).ToList();

            ViewBag.id = selectedUser.ID;
            ViewBag.name = selectedUser.Name;
            ViewBag.tin = selectedUser.TIN;
            ViewBag.code = selectedUser.Code;
            ViewBag.rdo = selectedUser.RDO;
            ViewBag.staddress = selectedUser.StreetAddress;
            ViewBag.brgy = brgy.Name;
            ViewBag.municipality = mncplty.Name;
            ViewBag.region = rgn.Name;
            ViewBag.zipcode = selectedUser.ZipCode;
            ViewBag.phone = selectedUser.PhoneNumber;
            ViewBag.email = selectedUser.EmailAddress;
            ViewBag.website = selectedUser.Website;
            return View();
        }

        [HttpPost]
        public IActionResult Edit(IFormFile imageFile)
        {
            byte[]? imagebytes = null;
            if (imageFile != null && imageFile.Length > 0)
            {
                using (var memoryStream = new MemoryStream())
                {
                    imageFile.CopyToAsync(memoryStream);
                    imagebytes = memoryStream.ToArray(); // Convert to byte array
                }
            }   

            var id = Request.Form["id"];
            var code = Request.Form["code"];
            var name = Request.Form["name"];
            var tin = Request.Form["tin"];
            var rdo = Request.Form["rdo"];
            var staddress = Request.Form["staddress"];
            string barangay = Request.Form["barangay"];
            string municipality = Request.Form["municipality"];
            string region = Request.Form["region"];
            var zipcode = Request.Form["zipcode"];
            var number = Request.Form["number"];
            var email = Request.Form["email"];
            var website = Request.Form["website"];

            // Check if any variable is null or empty
            if (string.IsNullOrWhiteSpace(code) ||
                string.IsNullOrWhiteSpace(name) ||
                string.IsNullOrWhiteSpace(tin) ||
                string.IsNullOrWhiteSpace(rdo) ||
                string.IsNullOrWhiteSpace(staddress) ||
                string.IsNullOrWhiteSpace(barangay) ||
                string.IsNullOrWhiteSpace(municipality) ||
                string.IsNullOrWhiteSpace(region) ||
                string.IsNullOrWhiteSpace(zipcode) ||
                string.IsNullOrWhiteSpace(number) ||
                string.IsNullOrWhiteSpace(email) ||
                string.IsNullOrWhiteSpace(website))
            {
                // Redirect to Edit action if any field is empty
                TempData["alert"] = "<span class='text-danger'>Fill up all the Fields</span>";
                return RedirectToAction("Edit");
            }

            var getBrgID = dataContext.Barangay.FirstOrDefault(b => b.Name == barangay);
            var getMtyID = dataContext.Municipality.FirstOrDefault(b => b.Name == municipality);
            var getRegID = dataContext.Region.FirstOrDefault(b => b.Name == region);

            var brgyid = getBrgID?.ID;
            var mtyid = getMtyID?.ID;
            var regid = getRegID?.ID;

            var selecteduser = dataContext.LGU.FirstOrDefault(p => p.ID == 1);

            var oldimage = selecteduser?.Logo;
            byte[]? image = null;

            if (imagebytes != null)
            { 
                image = imagebytes;
            }
            else
            {
                image = oldimage;
            }

            string strImage = _globalMethods.ByteArrayToHexString(image);

            sql = $"UPDATE LGU SET Code = '{code}', Logo = 0x{strImage}, Name = '{name}', TIN = '{tin}', RDO = '{rdo}', [Phone Number] = '{number}', [Email Address] = '{email}' " +
                $", Website = '{website}', [Street Address] = '{staddress}', [Barangay ID] = {brgyid}, [Municipality ID] = {mtyid}, [Region ID] = {regid}" +
                $", [ZIP Code] = {zipcode}, Active = 1, [Modify By] = '{HttpContext.Session.GetString(SessionKeyName)}', [Modify Date] = GETDATE() WHERE ID = {id}";
            var success = dataContext.Database.ExecuteSqlRaw(sql);

            if (success > 0)
            {
                ViewBag.alert = "<span class='text-success'>LGU Succesfully Updated</span>";
            }

            var selectedUser = dataContext.LGU.FirstOrDefault();
            var brgy = dataContext.Barangay.FirstOrDefault(p => p.ID == selectedUser.BarangayID);
            var mncplty = dataContext.Municipality.FirstOrDefault(p => p.ID == selectedUser.MunicipalityID);
            var rgn = dataContext.Region.FirstOrDefault(p => p.ID == selectedUser.RegionID);
            TempData["barangay"] = dataContext.Barangay.Where(p => p.Active == true).ToList();
            TempData["municipality"] = dataContext.Municipality.Where(p => p.Active == true).ToList();
            TempData["region"] = dataContext.Region.Where(p => p.Active == true).ToList();

            ViewBag.id = selectedUser.ID;
            ViewBag.name = selectedUser.Name;
            ViewBag.tin = selectedUser.TIN;
            ViewBag.code = selectedUser.Code;
            ViewBag.rdo = selectedUser.RDO;
            ViewBag.staddress = selectedUser.StreetAddress;
            ViewBag.brgy = brgy.Name;
            ViewBag.municipality = mncplty.Name;
            ViewBag.region = rgn.Name;
            ViewBag.zipcode = selectedUser.ZipCode;
            ViewBag.phone = selectedUser.PhoneNumber;
            ViewBag.email = selectedUser.EmailAddress;
            ViewBag.website = selectedUser.Website;
            return View();
        }

    }
}
