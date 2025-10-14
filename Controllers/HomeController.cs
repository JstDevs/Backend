using DMS.Models;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using static Org.BouncyCastle.Math.EC.ECCurve;

namespace DMS.Controllers
{
    public class HomeController : Controller
    {
        public string name = "";
        public const string SessionKeyName = "username";
        private readonly ILogger<HomeController> _logger;
        private readonly IHttpContextAccessor contxt;

        private readonly DMS_DbContext dataContext; 
        private readonly IConfiguration _configuration;

        public HomeController(IConfiguration config, ILogger<HomeController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor)
        {
            _configuration = config;
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
        }

        public IActionResult Index()
        {
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View();
        }

        public IActionResult Privacy()
        {
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View();
        }

        public IActionResult LogIn()
        {
            HttpContext.Session.Clear();
            return View();
        }

        public IActionResult ChangePass()
        {
            TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
            return View();
        }

        public IActionResult Dashboard()
        {

            string connectionstring = _configuration.GetConnectionString("Digitalization");
            using (SqlConnection connection = new SqlConnection(connectionstring))
            {
                connection.Open();


                string queryTotalDocumentCount = @"SELECT COUNT(*) AS TotalDocuments FROM [Documents] Where [Active] = 1";
            string queryTotalUsersCount = @"SELECT COUNT(*) AS TotalUsers FROM [Users] Where [Active] = 1";
            string queryTotalDepartmentCount = @"SELECT COUNT(*) AS TotalDepartments FROM [Department] Where [Active] = 1";
            string queryTotalDocumentTypeCount = @"SELECT COUNT(*) AS TotalDocumentType FROM [SubDepartment] Where [Active] = 1";


            using (SqlCommand command = new SqlCommand(queryTotalDocumentCount, connection))
            using (SqlDataReader reader = command.ExecuteReader())
            {
                if (reader.Read())
                {
                    ViewBag.TotalDocuments = reader["TotalDocuments"];
                }
            }
            using (SqlCommand command = new SqlCommand(queryTotalUsersCount, connection))
            using (SqlDataReader reader = command.ExecuteReader())
            {
                if (reader.Read())
                {
                    ViewBag.TotalUsers = reader["TotalUsers"];
                }
            }
            using (SqlCommand command = new SqlCommand(queryTotalDepartmentCount, connection))
            using (SqlDataReader reader = command.ExecuteReader())
            {
                if (reader.Read())
                {
                    ViewBag.TotalDepartments = reader["TotalDepartments"];
                }
            }
            using (SqlCommand command = new SqlCommand(queryTotalDocumentTypeCount, connection))
            using (SqlDataReader reader = command.ExecuteReader())
            {
                if (reader.Read())
                {
                    ViewBag.TotalDocumentTypes = reader["TotalDocumentType"];
                }
            }
           





            return View();
        }
        }

        [HttpPost]
        [AutoValidateAntiforgeryToken]
        public IActionResult LogIn(UsersModel model)
        {
            string pass = "";
            if (model.Password != null)
                pass = EncryptionHelper.FunEncrypt(model.Password);

            // Validate if the name and age exist in the database
            bool exists = dataContext.Users.Any(p => p.UserName == model.UserName && p.Password == pass);

            if (exists)
            {
                if (string.IsNullOrEmpty(HttpContext.Session.GetString(SessionKeyName)))
                {
                    HttpContext.Session.SetString(SessionKeyName, model.UserName);
                }
                return RedirectToAction("Index");
            }
            else {
                ViewBag.exists = "False";
                return View();
            }
        }

        [HttpPost]
        [AutoValidateAntiforgeryToken]
        public async Task<IActionResult> ChangePass(ChangePassModel model)
        {
            string pass = EncryptionHelper.FunEncrypt(model.Current);

            // Retrieve a specific record by ID
            var item = dataContext.Users.FirstOrDefault(m => m.UserName == HttpContext.Session.GetString(SessionKeyName));

            if (item.Password != pass)
            {
                TempData["alert"] = "<p class=\"text-danger alert-danger p-2\">Current Password is Incorrect</p>";
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                return View();
            }
            else if (model.NewPass != model.ConfirmPass)
            {
                TempData["alert"] = "<p class=\"text-danger alert-danger p-2\">New and Confirm Password is incorrect</p>";
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                return View();
            }
            else
            {
                item.Password = EncryptionHelper.FunEncrypt(model.NewPass);
                dataContext.Update(item);
                await dataContext.SaveChangesAsync();
                TempData["alert"] = "<p class=\"text-success alert-success p-2\">Password Changed</p>";
                TempData["username"] = HttpContext.Session.GetString(SessionKeyName);
                return View();
            }
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
