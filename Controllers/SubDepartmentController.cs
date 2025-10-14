using DMS.Models;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Diagnostics;

namespace DMS.Controllers
{
    public class SubDepartmentController : Controller
    {
        public const string SessionKeyName = "username";
        private readonly ILogger<SubDepartmentController> _logger;
        private readonly IHttpContextAccessor contxt;

        private DMS_DbContext dataContext { get; set; }

        public SubDepartmentController(ILogger<SubDepartmentController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
        }

        public IActionResult Create()
        {
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View();
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Create(SubDepartmentModel subDepartment)
        {
            // Validate if the name and age exist in the database
            bool nameExist = dataContext.SubDepartment.Any(p => p.Name == subDepartment.Name);
            bool codeExist = dataContext.SubDepartment.Any(p => p.Code == subDepartment.Code);

            if (nameExist)
            {
                ViewBag.NameAlert = "<span class='text-danger'>This Name already Exist</span>";
                return View(subDepartment);
            }
            if (subDepartment.Name == null)
            {
                ViewBag.NameAlert = "<span class='text-danger'>Please Input a Name</span>";
                return View(subDepartment);
            }
            if (codeExist)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>This Code already Exist</span>";
                return View(subDepartment);
            }
            if (subDepartment.Code == null)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>Please Input a Code</span>";
                return View(subDepartment);
            }

            subDepartment.CreatedDate = DateTime.Now;
            subDepartment.Active = true;
            subDepartment.CreatedBy = HttpContext.Session.GetString(SessionKeyName);
            dataContext.SubDepartment.Add(subDepartment);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Edit(SubDepartmentModel subDepartment)
        {
            var name = (string)TempData["Name"];
            var code = (string)TempData["Code"];

            // Validate if the name and age exist in the database
            bool nameExist = dataContext.SubDepartment.Any(p => p.Name == subDepartment.Name && p.Name != name);
            bool codeExist = dataContext.SubDepartment.Any(p => p.Code == subDepartment.Code && p.Code != code);

            var active = (bool)TempData["Active"];
            var CreatedBy = (string)TempData["CreatedBy"];
            var CreatedDate = (DateTime)TempData["CreatedDate"];

            if (subDepartment.Name == name && subDepartment.Code == code)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>You don't change any of the data!</span>";
                LoadSubDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(subDepartment);
            }
            if (nameExist)
            {
                ViewBag.NameAlert = "<span class='text-danger'>This Name already Exist</span>";
                LoadSubDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(subDepartment);
            }
            if (subDepartment.Name == null)
            {
                ViewBag.NameAlert = "<span class='text-danger'>Please Input a Name</span>";
                LoadSubDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(subDepartment);
            }
            if (codeExist)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>This Code already Exist</span>";
                LoadSubDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(subDepartment);
            }
            if (subDepartment.Code == null)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>Please Input a Code</span>";
                LoadSubDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(subDepartment);
            }

            subDepartment.CreatedDate = CreatedDate;
            subDepartment.Active = active;
            subDepartment.CreatedBy = CreatedBy;
            subDepartment.ModifyDate = DateTime.Now;
            subDepartment.ModifyBy = HttpContext.Session.GetString(SessionKeyName);
            dataContext.SubDepartment.Update(subDepartment);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }

        public void LoadSubDepartmentTemp(string name, string code, bool active, string CreatedBy, DateTime CreatedDate)
        {
            TempData["Name"] = name;
            TempData["Code"] = code;
            TempData["Active"] = active;
            TempData["CreatedBy"] = CreatedBy;
            TempData["CreatedDate"] = CreatedDate;
        }

        public IActionResult Edit(long id)
        {
            if (id == null || id == 0)
                return NotFound();

            var subDepartment = dataContext.SubDepartment.Find(id);

            if (subDepartment == null)
                return NotFound();

            TempData["Name"] = subDepartment.Name;
            TempData["Code"] = subDepartment.Code;
            TempData["Active"] = subDepartment.Active;
            TempData["CreatedBy"] = subDepartment.CreatedBy;
            TempData["CreatedDate"] = subDepartment.CreatedDate;
            return View(subDepartment);
        }

        public IActionResult Delete(long id)
        {
            var obj = dataContext.SubDepartment.Find(id);
            if (obj == null)
                return NotFound();

            dataContext.SubDepartment.Remove(obj);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }

        public IActionResult Index()
        {
            // Retrieve the data from TempData
            var finalListJson = TempData["FinalList"] as string;

            if (finalListJson != null)
            {
                // Deserialize back to List<SubDepartmentModel>
                var finalList = JsonConvert.DeserializeObject<List<SubDepartmentModel>>(finalListJson);

                // Pass it to the view or process it as needed
                return View(finalList);
            }

            IEnumerable<SubDepartmentModel> SubDepartmentList = dataContext.SubDepartment;
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View(SubDepartmentList);
        }

        [HttpPost]
        public IActionResult Search(string? inputValue)
        {
            if (inputValue == null)
            {
                return RedirectToAction("Index");
            }

            List<SubDepartmentModel> nameSubDepartments = dataContext.SubDepartment
                                                            .Where(d => d.Name.Contains(inputValue))
                                                            .ToList();

            List<SubDepartmentModel> codeSubDepartments = dataContext.SubDepartment
                                                            .Where(d => d.Code.Contains(inputValue))
                                                            .ToList();

            var FinalList = nameSubDepartments.Concat(codeSubDepartments)
                                .Distinct()
                                .ToList();

            // Store in TempData (need to serialize to JSON or similar format)
            TempData["FinalList"] = JsonConvert.SerializeObject(FinalList);

            // Redirect to another action
            return RedirectToAction("Index");
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
