using DMS.Models;
using Newtonsoft.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Client;
using System;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore.SqlServer;

namespace DMS.Controllers
{
    public class DepartmentController : Controller
    {
        public const string SessionKeyName = "username";
        private readonly ILogger<DepartmentController> _logger;
        private readonly IHttpContextAccessor contxt;

        private DMS_DbContext dataContext { get; set; }

        public DepartmentController(ILogger<DepartmentController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor)
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
        public IActionResult Create(DepartmentModel department)
        {
            // Validate if the name and age exist in the database
            bool nameExist = dataContext.Department.Any(p => p.Name == department.Name);
            bool codeExist = dataContext.Department.Any(p => p.Code == department.Code);

            if (nameExist)
            {
                ViewBag.NameAlert = "<span class='text-danger'>This Name already Exist</span>";
                return View(department);
            }
            if (department.Name == null)
            {
                ViewBag.NameAlert = "<span class='text-danger'>Please Input a Name</span>";
                return View(department);
            }
            if (codeExist)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>This Code already Exist</span>";
                return View(department);
            }
            if (department.Code == null)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>Please Input a Code</span>";
                return View(department);
            }

            department.CreatedDate = DateTime.Now;
            department.Active = true;
            department.CreatedBy = HttpContext.Session.GetString(SessionKeyName);
            dataContext.Department.Add(department);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Edit(DepartmentModel department)
        {
            var name = (string)TempData["Name"];
            var code = (string)TempData["Code"];

            // Validate if the name and age exist in the database
            bool nameExist = dataContext.Department.Any(p => p.Name == department.Name && p.Name != name);
            bool codeExist = dataContext.Department.Any(p => p.Code == department.Code && p.Code != code);

            var active = (bool)TempData["Active"];
            var CreatedBy = (string)TempData["CreatedBy"];
            var CreatedDate = (DateTime)TempData["CreatedDate"];

            if (department.Name == name && department.Code == code)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>You don't change any of the data!</span>";
                LoadDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(department);
            }
            if (nameExist)
            {
                ViewBag.NameAlert = "<span class='text-danger'>This Name already Exist</span>";
                LoadDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(department);
            }
            if (department.Name == null)
            {
                ViewBag.NameAlert = "<span class='text-danger'>Please Input a Name</span>";
                LoadDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(department);
            }
            if (codeExist)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>This Code already Exist</span>";
                LoadDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(department);
            }
            if (department.Code == null)
            {
                ViewBag.CodeAlert = "<span class='text-danger'>Please Input a Code</span>";
                LoadDepartmentTemp(name, code, active, CreatedBy, CreatedDate);
                return View(department);
            }

            department.CreatedDate = CreatedDate;
            department.Active = active;
            department.CreatedBy = CreatedBy;
            department.ModifyDate = DateTime.Now;
            department.ModifyBy = HttpContext.Session.GetString(SessionKeyName);
            dataContext.Department.Update(department);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }

        public void LoadDepartmentTemp(string name, string code, bool active, string CreatedBy, DateTime CreatedDate)
        {
            TempData["Name"] = name;
            TempData["Code"] = code;
            TempData["Active"] = active;
            TempData["CreatedBy"] = CreatedBy;
            TempData["CreatedDate"] = CreatedDate;
        }

        public IActionResult Edit(int id)
        { 
            if (id == null || id == 0)
                return NotFound();
            
            var department = dataContext.Department.Find(id);

            if (department == null) 
                return NotFound();

            TempData["Name"] = department.Name;
            TempData["Code"] = department.Code;
            TempData["Active"] = department.Active;
            TempData["CreatedBy"] = department.CreatedBy;
            TempData["CreatedDate"] = department.CreatedDate;
            return View(department);
        }

        public IActionResult Delete(int id)
        {
            var obj = dataContext.Department.Find(id);
            if (obj == null)   
                return NotFound();

            dataContext.Department.Remove(obj);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }

        public IActionResult Index()
        {
            // Retrieve the data from TempData
            var finalListJson = TempData["FinalList"] as string;

            if (finalListJson != null)
            {
                // Deserialize back to List<DepartmentModel>
                var finalList = JsonConvert.DeserializeObject<List<DepartmentModel>>(finalListJson);

                // Pass it to the view or process it as needed
                return View(finalList);
            }

            IEnumerable<DepartmentModel> DepartmentList = dataContext.Department;
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View(DepartmentList);
        }

        [HttpPost]
        public IActionResult Search(string? inputValue)
        {
            if (inputValue == null)
            {
                return RedirectToAction("Index");
            }

            List<DepartmentModel> nameDepartments = dataContext.Department
                                                            .Where(d => d.Name.Contains(inputValue))
                                                            .ToList();

            List<DepartmentModel> codeDepartments = dataContext.Department
                                                            .Where(d => d.Code.Contains(inputValue))
                                                            .ToList();

            var FinalList = nameDepartments.Concat(codeDepartments)
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
