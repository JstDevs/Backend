using DMS.Models;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Client;
using Newtonsoft.Json;

namespace DMS.Controllers
{
    public class UserAccessController : Controller
    {
        public const string SessionKeyName = "username";
        private readonly ILogger<UserAccessController> _logger;
        private readonly IHttpContextAccessor contxt;

        private DMS_DbContext dataContext { get; set; }

        public UserAccessController(ILogger<UserAccessController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
        }

        public IActionResult Index(long userid, string description)
        {
            ViewData["UserAccess"] = dataContext.UserAccess.ToList();
            ViewData["Module"] = dataContext.Module.ToList();
            ViewData["SelectedUserID"] = userid;

            if (userid != 0)
            {
                ViewData["ModuleAccess"] = dataContext.ModuleAccess.Where(p => p.UAID == userid).OrderBy(p => p.ModuleID).ToList();
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                ViewBag.description = description;
                ViewBag.userid = userid;
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                return View();
            }

            if (TempData["id"] != null && TempData["description"] != null)
            {
                var id = Convert.ToInt64(TempData["id"]);
                var descript = TempData["description"];
                ViewData["ModuleAccess"] = dataContext.ModuleAccess.Where(p => p.UAID == id).OrderBy(p => p.ModuleID).ToList();
                ViewBag.description = descript;
                ViewBag.userid = id;
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                return View();
            }

            // Retrieve the data from TempData
            var usersListJson = TempData["UsersList"] as string;

            if (usersListJson != null)
            {
                // Deserialize back to List<DepartmentModel>
                var usersList = JsonConvert.DeserializeObject<List<UserAccessModel>>(usersListJson);

                ViewData["UserAccess"] = usersList;
                // Pass it to the view or process it as needed

                var frstUser = usersList.FirstOrDefault();
                ViewData["ModuleAccess"] = dataContext.ModuleAccess.Where(p => p.UAID == frstUser.ID).OrderBy(p => p.ModuleID).ToList();
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                ViewBag.description = frstUser.Description;
                ViewBag.userid = frstUser.ID;
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                return View();
            }

            var firstUser = dataContext.UserAccess.FirstOrDefault();

            ViewData["ModuleAccess"] = dataContext.ModuleAccess.Where(p => p.UAID == firstUser.ID).OrderBy(p => p.ModuleID).ToList();
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            ViewBag.description = firstUser.Description;
            ViewBag.userid = firstUser.ID;
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View();
        }

        public IActionResult Edit(long userid, string description)
        {
            ViewData["ModuleAccess"] = dataContext.ModuleAccess.Where(p => p.UAID == userid).OrderBy(p => p.ModuleID).ToList();
            ViewData["UserAccess"] = dataContext.UserAccess.ToList();
            ViewData["Module"] = dataContext.Module.ToList();

            var moduleAccessData = dataContext.ModuleAccess.Where(p => p.UAID == userid).OrderBy(p => p.ModuleID).ToList();
            var moduleData = dataContext.Module.ToList();

            ViewBag.description = description;
            ViewBag.userid = userid;

            return View();
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Edit(long userid, string description, string inputValue)
        {
            var ModuleAccess = dataContext.ModuleAccess.Where(p => p.UAID == userid).OrderBy(p => p.ModuleID).ToList();
            var module = dataContext.Module.OrderBy(p => p.ID).ToList();

            bool nameExist = dataContext.UserAccess.Any(p => p.Description == inputValue && p.Description != description);

            if (nameExist)
            {
                loadViewData(userid, description);
                alert(description, userid, "Name Already Exists");
                return View();
            }

            if (inputValue != null)
            {
                var useraccess = dataContext.UserAccess.Where(p => p.ID == userid).FirstOrDefault();
                useraccess.Description = inputValue;

                dataContext.UserAccess.Update(useraccess);
                dataContext.SaveChanges();

                ViewBag.description = inputValue;
                ViewBag.userid = userid;
            }

            for (int i = 0; i < module.Count; i++)
            {
                for (int j = 0; j < ModuleAccess.Count; j++)
                {
                    if (module[i].ID == ModuleAccess[j].ModuleID)
                    {
                        ModuleAccess[j].View = Request.Form[$"View{j+1}"] == "true";
                        ModuleAccess[j].Add = Request.Form[$"Add{j + 1}"] == "true";
                        ModuleAccess[j].Edit = Request.Form[$"Edit{j + 1}"] == "true";
                        ModuleAccess[j].Delete = Request.Form[$"Delete{j + 1}"] == "true";
                        ModuleAccess[j].Print = Request.Form[$"Print{j + 1}"] == "true";

                        dataContext.ModuleAccess.Update(ModuleAccess[j]);
                        dataContext.SaveChanges();
                    }
                }
            }
            ViewBag.Alert = $"<span class='text-success'>User Access Successfully Changed</span>";
            loadViewData(userid, description);
            return View();
        }

        public ActionResult Add()
        {
            ViewData["Module"] = dataContext.Module.ToList();

            return View();
        }

        [HttpPost]
        public ActionResult Add(string inputValue)
        {
            List<ModuleModel> moduleModels = new List<ModuleModel>();

            ViewData["Module"] = dataContext.Module.ToList();
            var module = dataContext.Module.OrderBy(p => p.ID).ToList();

            if (inputValue == null)
            {
                ViewBag.Alert = $"<span class='text-danger'>Please Enter User Description</span>";
                return View();
            }

            if (inputValue != null)
            {
                bool nameExist = dataContext.UserAccess.Any(p => p.Description == inputValue);

                if (nameExist)
                {
                    ViewBag.Alert = $"<span class='text-danger'>User Description Already Exist</span>";
                    return View();
                }

                UserAccessModel userAccessModel = new UserAccessModel
                {
                    Description = inputValue,
                    Createdby = HttpContext.Session.GetString(SessionKeyName),
                    CreatedDate = DateTime.Now,
                    ID = 0
                };

                dataContext.UserAccess.Add(userAccessModel);
                dataContext.SaveChanges();

                var addedUserAccess = dataContext.UserAccess.Where(p => p.Description == inputValue).FirstOrDefault();

                if (addedUserAccess != null)
                {
                    for (int i = 0; i < module.Count; i++)
                    {
                        ModuleAccessModel moduleAccessmodel = new ModuleAccessModel
                        {
                            ID = 0,
                            UAID = addedUserAccess.ID,
                            ModuleID = module[i].ID,
                            View = Request.Form[$"View{i + 1}"] == "true",
                            Add = Request.Form[$"Add{i + 1}"] == "true",
                            Edit = Request.Form[$"Edit{i + 1}"] == "true",
                            Delete = Request.Form[$"Delete{i + 1}"] == "true",
                            Print = Request.Form[$"Print{i + 1}"] == "true"
                        };

                        dataContext.ModuleAccess.Add(moduleAccessmodel);
                        dataContext.SaveChanges();
                    }
                }

                var id = addedUserAccess.ID;
                var description = addedUserAccess.Description;

                TempData["id"] = (int)id;
                TempData["description"] = (string)description;
                return RedirectToAction("Index");
            }

            return View();
        }

        public IActionResult Delete(long userid)
        {
            var obj = dataContext.UserAccess.Find(userid);
            var moduleList = dataContext.ModuleAccess.Where(p => p.UAID == userid).ToList();

            if (obj != null)
            { 
                dataContext.UserAccess.Remove(obj);
                dataContext.SaveChanges();

                foreach (var module in moduleList)
                { 
                    dataContext.ModuleAccess.Remove(module);
                    dataContext.SaveChanges();
                }
            }
            return RedirectToAction("Index");
        }

        public IActionResult Search(string? inputValue)
        {
            if (inputValue == null)
            {
                return RedirectToAction("Index");
            }

            List<UserAccessModel> userAccess = dataContext.UserAccess
                                                            .Where(d => d.Description.Contains(inputValue))
                                                            .ToList();

            if (userAccess.Count > 0)
            {
                // Store in TempData (need to serialize to JSON or similar format)
                TempData["UsersList"] = JsonConvert.SerializeObject(userAccess);
            }

            // Redirect to another action
            return RedirectToAction("Index");
        }

        public void alert(string description, long userid, string alert)
        {
            ViewBag.description = description;
            ViewBag.userid = userid;
            ViewBag.Alert = $"<span class='text-danger'>{alert}</span>";
        }

        public void loadViewData(long userid, string description)
        {
            ViewData["ModuleAccess"] = dataContext.ModuleAccess.Where(p => p.UAID == userid).OrderBy(p => p.ModuleID).ToList();
            ViewData["UserAccess"] = dataContext.UserAccess.ToList();
            ViewData["Module"] = dataContext.Module.ToList();
        }
    }
}
