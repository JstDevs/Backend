using DMS.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DMS.Controllers
{
    public class MunicipalityController : Controller
    {
        public const string SessionKeyName = "username";
        public string sql, strSQL;
        private readonly ILogger<MunicipalityController> _logger;
        private readonly IHttpContextAccessor contxt;
        private readonly GlobalMethods _globalMethods;

        private DMS_DbContext dataContext { get; set; }

        public MunicipalityController(ILogger<MunicipalityController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor, GlobalMethods globalMethods)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
            _globalMethods = globalMethods;
        }

        public IActionResult Index()
        {
            ViewData["Municipalities"] = dataContext.Municipality.Where(p => p.Active == true).ToList();
            if (TempData["alert"] != null)
            {
                ViewBag.alert = TempData["alert"];
            }
            return View();
        }

        public IActionResult Delete(long id)
        {
            string customer = _globalMethods.ValidateDelete("[Customer]", "[Municipality ID]", id, "Municipality is being used in Customer Form!");
            string employee = _globalMethods.ValidateDelete("[Employee]", "[Municipality ID]", id, "Municipality is being used in Employee Form!");
            string vendor = _globalMethods.ValidateDelete("[Vendor]", "[Municipality ID]", id, "Municipality is being used in Vendor Form!");
            string lgu = _globalMethods.ValidateDelete("[LGU]", "[Municipality ID]", id, "Municipality is being used in LGU Form!");

            if (customer != null)
            {
                TempData["alert"] = customer;
                return RedirectToAction("Index");
            }
            else if (employee != null)
            {
                TempData["alert"] = employee;
                return RedirectToAction("Index");
            }
            else if (vendor != null)
            {
                TempData["alert"] = vendor;
                return RedirectToAction("Index");
            }
            else if (lgu != null)
            {
                TempData["alert"] = lgu;
                return RedirectToAction("Index");
            }

            string sql = $"UPDATE Municipality SET Active = 0 WHERE ID = {id}";
            string strSQL = sql + _globalMethods.funAuditTrail("Municipality", "DELETE", sql);

            dataContext.Database.ExecuteSqlRaw(strSQL);
            return RedirectToAction("Index");
        }

        public IActionResult Edit()
        {
            if (TempData["id"] != null)
            {
                long id = long.Parse(TempData["id"].ToString());
                var selectedModel = dataContext.Municipality.FirstOrDefault(p => p.ID == id);

                ViewBag.id = id;
                ViewBag.name = selectedModel.Name;
                return View();
            }

            return RedirectToAction("Index");
        }

        [HttpPost]
        public IActionResult Edit(string inputValue, long id)
        {
            var result = dataContext.Municipality.FirstOrDefault(p => p.Name == inputValue);

            if (inputValue == null)
            {
                Alert(id, "<span class='text-danger'>Please Enter Municipality Name!</span>");
                return View();
            }
            else if (result != null)
            {
                Alert(id, "<span class='text-danger'>This Name Already Exist!</span>");
                return View();
            }
            else if (id != 0 && inputValue != null)
            {
                sql = $"UPDATE Municipality SET Name = '{inputValue}' WHERE ID = {id}";
                string strSQL = sql + _globalMethods.funAuditTrail("Municipality", "UPDATE", sql);

                dataContext.Database.ExecuteSqlRaw(sql);
                return RedirectToAction("Index");
            }

            return RedirectToAction("Index");
        }

        public IActionResult EditRoute(long id)
        {
            TempData["id"] = id.ToString();
            return RedirectToAction("Edit");
        }

        public void Alert(long id, string alert)
        {
            var selectedModel = dataContext.Municipality.FirstOrDefault(p => p.ID == id);

            ViewBag.id = id;
            ViewBag.name = selectedModel.Name;
            ViewBag.alert = alert;
        }

        public IActionResult Add()
        {
            return View();
        }

        [HttpPost]
        public IActionResult Add(string inputValue)
        {
            var barangayExist = dataContext.Municipality.FirstOrDefault(p => p.Name == inputValue && p.Active == true);
            var barangayExisted = dataContext.Municipality.FirstOrDefault(p => p.Name == inputValue && p.Active != true);

            if (inputValue == null)
            {
                ViewBag.alert = "<span class='text-danger'>Please Input a Name!</span>";
            }
            else if (barangayExist != null)
            {
                ViewBag.alert = "<span class='text-danger'>This Name Already Exist!</span>";
            }
            else if (barangayExisted != null)
            {
                sql = $"UPDATE Municipality SET Active = 1 WHERE Name = '{inputValue}'";
                strSQL = sql + _globalMethods.funAuditTrail("Municipality", "UPDATE", sql);
                dataContext.Database.ExecuteSqlRaw(strSQL);

                return RedirectToAction("Index");
            }
            else
            {

                sql = $"INSERT INTO Municipality (Name, Active, [Created By], [Created Date] ) VALUES ('{inputValue}', 1, '{HttpContext.Session.GetString(SessionKeyName)}', GETDATE())";
                strSQL = sql + _globalMethods.funAuditTrail("Municipality", "INSERT", sql);
                dataContext.Database.ExecuteSqlRaw(strSQL);

                return RedirectToAction("Index");
            }

            return View();
        }

        [HttpPost]
        public IActionResult Index(string inputValue)
        {
            if (inputValue == null)
            {
                ViewData["Municipalities"] = dataContext.Municipality.Where(p => p.Active == true).ToList();
                return View();
            }
            ViewData["Municipalities"] = dataContext.Municipality.Where(p => p.Name.Contains(inputValue) && p.Active == true).ToList();
            return View();
        }
    }
}
