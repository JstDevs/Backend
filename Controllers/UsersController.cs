using DMS.Models;
using DocumentFormat.OpenXml.Bibliography;
using DocumentFormat.OpenXml.Wordprocessing;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System;
using System.Diagnostics;

namespace DMS.Controllers
{
    public class UsersController : Controller
    {
        public const string SessionKeyName = "username";
        private readonly ILogger<UsersController> _logger;
        private readonly IHttpContextAccessor contxt;

        private DMS_DbContext dataContext { get; set; }

        public UsersController(ILogger<UsersController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
        }

        public IActionResult Create()
        {
            ViewData["userAccessList"] = dataContext.UserAccess.ToList();
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View();
        }
        public IActionResult Index()
        {
            var finalListJson = TempData["FinalList"] as string;

            if (finalListJson != null)
            {
                var finalList = JsonConvert.DeserializeObject<List<UsersModel>>(finalListJson);

                foreach (var user in finalList)
                {
                    user.UserAccess = dataContext.UserAccess
                        .FirstOrDefault(ua => ua.ID == user.UserAccessID)?.Description;
                }

                return View(finalList);
            }

            var UsersList = (from user in dataContext.Users
                             join access in dataContext.UserAccess on user.UserAccessID equals access.ID into accessGroup
                             from access in accessGroup.DefaultIfEmpty()
                             where user.Active
                             select new UsersModel
                             {
                                 ID = user.ID,
                                 EmployeeID = user.EmployeeID,
                                 UserName = user.UserName,
                                 Password = user.Password,
                                 UserAccessID = user.UserAccessID,
                                 UserAccess = access != null ? access.Description : null,
                                 Active = user.Active,
                                 CreatedBy = user.CreatedBy,
                                 CreatedDate = user.CreatedDate
                             }).ToList();

            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View(UsersList);
        }


        public IActionResult Delete(long id)
        {
            var obj = dataContext.Users.Find(id);
            if (obj == null)
                return NotFound();

            obj.Active = false;
            dataContext.SaveChanges();

            return RedirectToAction("Index");
        }


        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Edit(UsersModel Users, string password, string cpassword)
        {
            var employeeID = (string)TempData["EmployeeID"];
            var userName = (string)TempData["UsersUserName"];
            var userAccessID = (string)TempData["UserAccessID"];
            var userPassword = (string)TempData["Password"];

            // Validate if the name and age exist in the database
            bool userNameExist = dataContext.Users.Any(p => p.UserName == Users.UserName && p.UserName != userName);

            var active = (bool)TempData["Active"];
            var CreatedBy = (string)TempData["CreatedBy"];
            var CreatedDate = (DateTime)TempData["CreatedDate"];

            if (userNameExist)
            {
                ViewBag.UserNameAlert = "<span class='text-danger'>This User Name already Exist</span>";
                LoadUserTemp(employeeID, userName, userAccessID, userPassword, active, CreatedBy, CreatedDate);
                return View(Users);
            }
            if (Users.UserName == null)
            {
                ViewBag.UserNameAlert = "<span class='text-danger'>Please Input a User Name</span>";
                LoadUserTemp(employeeID, userName, userAccessID, userPassword, active, CreatedBy, CreatedDate);
                return View(Users);
            }

            if (!string.IsNullOrEmpty(password))
            {
                if (string.IsNullOrEmpty(cpassword))
                {
                     ViewBag.PasswordAlert = "<span class='text-danger'>Please confirm your password</span>";
                     LoadUserTemp(employeeID, userName, userAccessID, userPassword, active, CreatedBy, CreatedDate);
                    return View(Users);
                }

                if (password != cpassword)
                {
                    ViewBag.PasswordAlert = "<span class='text-danger'>Passwords do not match</span>";
                    LoadUserTemp(employeeID, userName, userAccessID, userPassword, active, CreatedBy, CreatedDate);
                    return View(Users);
                }

                Users.Password = GlobalMethods.Encrypt(password);
            }
            else
            {
                Users.Password = userPassword;
            }



            Users.EmployeeID = int.Parse(employeeID);
            Users.CreatedDate = CreatedDate;
            Users.CreatedBy = CreatedBy;
            Users.Active = active;
            dataContext.Users.Update(Users);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }


        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult Create(UsersModel Users, string password, string cpassword)
        {
            bool userNameExist = dataContext.Users.Any(p => p.UserName == Users.UserName);

            if (userNameExist)
            {
                ViewBag.UserNameAlert = "<span class='text-danger'>This User Name already Exist</span>";
                ViewData["userAccessList"] = dataContext.UserAccess.ToList();
                return View(Users);
            }
            if (Users.UserName == null)
            {
                ViewBag.UserNameAlert = "<span class='text-danger'>Please Input a User Name</span>";
                ViewData["userAccessList"] = dataContext.UserAccess.ToList();
                return View(Users);
            }

            if (!string.IsNullOrEmpty(password))
            {
                if (string.IsNullOrEmpty(cpassword))
                {
                    ViewBag.PasswordAlert = "<span class='text-danger'>Please confirm your password</span>";
                    ViewData["userAccessList"] = dataContext.UserAccess.ToList();
                    return View(Users);
                }

                if (password != cpassword)
                {
                    ViewBag.PasswordAlert = "<span class='text-danger'>Passwords do not match</span>";
                    ViewData["userAccessList"] = dataContext.UserAccess.ToList();
                    return View(Users);
                }
                Users.Password = GlobalMethods.Encrypt(password);
            }
            else
            {
                ViewBag.PasswordAlert = "<span class='text-danger'>Please Input a Password</span>";
                ViewData["userAccessList"] = dataContext.UserAccess.ToList();
                return View(Users);
            }

            Users.EmployeeID = 0;
            Users.CreatedDate = DateTime.Now;
            Users.Active = true;
            Users.CreatedBy = HttpContext.Session.GetString(SessionKeyName);
            dataContext.Users.Add(Users);
            dataContext.SaveChanges();
            return RedirectToAction("Index");
        }












        public void LoadUserTemp(string employeeID, string userName, string userAccessID, string userPassword , bool active, string CreatedBy, DateTime CreatedDate)
        {

            ViewData["userAccessList"] = dataContext.UserAccess.ToList();

            TempData["EmployeeID"] = employeeID;
            TempData["UserAccessID"] = userAccessID;
            TempData["UsersUserName"] = userName;
            TempData["Active"] = active;
            TempData["Password"] = userPassword;
            TempData["CreatedBy"] = CreatedBy;
            TempData["CreatedDate"] = CreatedDate;
        }

        public IActionResult Edit(long id)
        {
            if (id == null || id == 0)
                return NotFound();

            var user = dataContext.Users.Find(id);

            if (user == null)
                return NotFound();

            var userAccess = dataContext.UserAccess
        .FirstOrDefault(ua => ua.ID == user.UserAccessID);

            if (userAccess != null)
            {
                user.UserAccess = userAccess.Description;
            }

            TempData["EmployeeID"] = user.EmployeeID?.ToString();
            TempData["UserAccessID"] = user.UserAccessID?.ToString();
            TempData["UsersUserName"] = user.UserName;
            TempData["Password"] = user.Password;
            TempData["Active"] = user.Active;
            TempData["CreatedBy"] = user.CreatedBy;
            TempData["CreatedDate"] = user.CreatedDate;

            ViewData["userAccessList"] = dataContext.UserAccess.ToList();

            return View(user);
        }




        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }

    }
}
