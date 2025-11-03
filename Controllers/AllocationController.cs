using DMS.Models;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using System;

namespace DMS.Controllers
{
    public class AllocationController : Controller
    {
        public const string SessionKeyName = "username";
        public string sql;
        private readonly ILogger<AllocationController> _logger;
        private readonly IHttpContextAccessor contxt;

        private DMS_DbContext dataContext { get; set; }

        public AllocationController(ILogger<AllocationController> logger, DMS_DbContext _dataContext, IHttpContextAccessor httpContextAccessor)
        {
            _logger = logger;
            dataContext = _dataContext;
            contxt = httpContextAccessor;
        }
        public IActionResult Index(int depid, long linkid, long subdepid)
        {
            // Retrieve the data from TempData
            var finalListJson = TempData["FinalList"] as string;

            if (finalListJson != null)
            {
                // Deserialize back to List<DepartmentModel>
                var finalList = JsonConvert.DeserializeObject<List<DepartmentModel>>(finalListJson);

                ViewData["DepartmentList"] = finalList;

                var firstList = finalList.FirstOrDefault();

                LoadDocumentType(firstList.ID, 0);

                return View();
            }
            else
            {
                ViewData["DepartmentList"] = dataContext.Department.ToList();
            }

            ViewData["SubdepartmentList"] = dataContext.SubDepartment.ToList();

            var depID = TempData["depid"];

            if (depID != null)
            {
                LoadDocumentType((int)depID, subdepid);
                return View();
            }

            if (subdepid != 0 && linkid != 0)
            {
                LoadDocumentType(depid, subdepid);
                LoadDocumentAccess(linkid);
            }

            if (depid != 0)
            {
                LoadDocumentType(depid, subdepid);
                return View();
            }

            if (TempData["subdeptid"] != null)
            {
                var deptid = TempData["deptid"];
                var subdeptid = TempData["subdeptid"].ToString();
                var linkID = TempData["linkID"].ToString();

                depid = (int)deptid;
                subdepid = long.Parse(subdeptid);
                linkid = long.Parse(linkID);
                LoadDocumentType(depid, subdepid);
                LoadDocumentAccess(linkid);
                return View();
            }

            var depFirstList = dataContext.Department.FirstOrDefault();

            LoadDocumentType(depFirstList.ID, 0);

            return View();
        }

        public IActionResult AddSubdepartment(int depid, long subdepid)
        {
            var assignSubDep = dataContext.AssignSubdepartment.Where(p => p.DepartmentID == depid && p.Active == true).ToList();
            var dept = dataContext.Department.Where(p => p.ID == depid).FirstOrDefault();
            var subDeptList = dataContext.SubDepartment.ToList();
            ViewData["AssignSubDep"] = assignSubDep;
            ViewBag.Department = dept.Name;
            ViewBag.depid = depid;

            for (int i = 0; i < assignSubDep.Count; i++)
            {
                for (int j = 0; j < subDeptList.Count; j++)
                {
                    if (assignSubDep[i].SubDepartmentID == subDeptList[j].ID)
                    {
                        subDeptList.Remove(subDeptList[j]);
                    }
                }
            }

            ViewData["SubdepartmentList"] = subDeptList;

            if (subdepid != 0)
            {
                var Subdepartment = dataContext.SubDepartment.Where(p => p.ID == subdepid).ToList();

                ViewBag.Subdepartment = Subdepartment[0].Name;
                ViewBag.subdepid = subdepid;
            }
            else
            { 
                ViewBag.Subdepartment = subDeptList[0].Name;
                ViewBag.subdepid = subDeptList[0].ID;
            }

            return View();
        }

        public IActionResult SaveSubdepartment(int depid, long subdepid)
        {
            var checkSubDept = dataContext.AssignSubdepartment.Where(p => p.DepartmentID == depid && p.SubDepartmentID == subdepid).FirstOrDefault();
            string createdBy = HttpContext.Session.GetString(SessionKeyName);
            DateTime createdDate = DateTime.Now;

            if (checkSubDept != null)
            {
                sql = "UPDATE [Assign Subdepartment] Set Active = 1, [Created By] = {1}, [Created Date] = {2} WHERE [Link ID] = {0}";
                dataContext.Database.ExecuteSqlRaw(sql, checkSubDept.LinkID, createdBy, createdDate);

                TempData["linkID"] = checkSubDept.LinkID.ToString();
            }
            else
            {
                DateTime funGetServerDateTime = DateTime.Now;
                string strLinkID = funGetServerDateTime.ToString("MMddyyyyHHmmssffff");

                // Define your parameters
                long LinkID = long.Parse(strLinkID);
                long subDept = subdepid;
                long dept = depid;
                bool active = true;

                // Use parameterized SQL
                sql = "INSERT INTO [Assign Subdepartment] ([Link ID], [Department ID], [Subdepartment ID], Active, [Created By], [Created Date])" +
                             " VALUES ({0}, {1}, {2}, {3}, {4}, {5})";
                dataContext.Database.ExecuteSqlRaw(sql, LinkID, dept, subDept, active, createdBy, createdDate);

                List<string> sqls = new List<string>();

                for (int i = -1; i <= 11; i++)
                {
                    if (i == -1)
                    {
                        sql = $"INSERT INTO Fields VALUES ({LinkID}, {i}, 1, 'File Description', 'Text')";
                        sqls.Add(sql);
                    }
                    else if (i == 0)
                    {
                        sql = $"INSERT INTO Fields VALUES ({LinkID}, {i}, 1, 'File Date', 'Date')";
                        sqls.Add(sql);
                    }
                    else if (i > 0 && i < 11)
                    {
                        sql = $"INSERT INTO Fields VALUES ({LinkID}, {i}, 0, 'File Description {i}', 'Text')";
                        sqls.Add(sql);
                    }
                    else
                    {
                        sql = $"INSERT INTO Fields VALUES ({LinkID}, {i}, 0, '5', 'Number')";
                        sqls.Add(sql);
                    }
                }

                string concSQL = string.Join(Environment.NewLine, sqls);
                dataContext.Database.ExecuteSqlRaw(concSQL);

                TempData["linkID"] = strLinkID.ToString();
            }

            TempData["deptid"] = depid;
            TempData["subdeptid"] = subdepid.ToString();
            return RedirectToAction("Index");
        }

        public void LoadDocumentType(int depid, long subdepid)
        {
            var assignSubDep = dataContext.AssignSubdepartment.Where(p => p.DepartmentID == depid && p.Active == true).ToList();
            var dept = dataContext.Department.Where(p => p.ID == depid).FirstOrDefault();
            var subDeptList = dataContext.SubDepartment.ToList();
            ViewData["AssignSubDep"] = assignSubDep;
            ViewBag.Department = dept.Name;
            ViewBag.depid = depid;

            if (assignSubDep.Count > 0)
            {
                var subdept = dataContext.SubDepartment.ToList();

                for (int i = 0; i < assignSubDep.Count; i++)
                {
                    for (int j = 0; j < subDeptList.Count; j++)
                    {
                        if (assignSubDep[i].SubDepartmentID == subDeptList[j].ID)
                        {
                            subDeptList.Remove(subDeptList[j]);
                        }
                    }
                }

                if (subDeptList.Count > 0)
                {
                    ViewBag.remainingSub = true;
                }
                else
                {
                    ViewBag.remainingSub = false;
                }

                if (subdepid != 0)
                {
                    foreach (var sub in subdept)
                    {
                        if (sub.ID == subdepid)
                        {
                            ViewBag.SubDepartment = sub.Name;
                            ViewBag.subdepid = subdepid;
                        }
                    }
                    var item = dataContext.AssignSubdepartment.Where(p => p.DepartmentID == depid && p.SubDepartmentID == subdepid && p.Active == true).FirstOrDefault();

                    LoadDocumentAccess(item.LinkID);
                }
                else
                {
                    foreach (var sub in subdept)
                    {
                        if (sub.ID == assignSubDep[0].SubDepartmentID)
                        {
                            ViewBag.SubDepartment = sub.Name;
                            ViewBag.subdepid = assignSubDep[0].SubDepartmentID;
                        }
                    }
                    LoadDocumentAccess(assignSubDep[0].LinkID);
                }
            }
            else
            {
                ViewBag.remainingSub = true;
            }
        }

        public IActionResult Delete(long linkID)
        { 
            var selectedSubID = dataContext.AssignSubdepartment.Where(p => p.LinkID == linkID).FirstOrDefault();

            if (selectedSubID != null)
            {
                string sql = "UPDATE [Assign Subdepartment] SET Active = 0 WHERE [Link ID] = {0}";
                // Execute the SQL command with parameters
                int affectedRows = dataContext.Database.ExecuteSqlRaw(sql, linkID);
            }

            return RedirectToAction("Index");
        }

        public IActionResult DeleteUser(long linkid, long userid, int depid, long subdepid)
        {
            var selectedUser = dataContext.DocumentAccess.FirstOrDefault(p => p.LinkID == linkid && p.UserID == userid);

            if (selectedUser != null)
            {
                string sql = "UPDATE [Document Access] SET Active = 0 WHERE [Link ID] = {0} AND [User ID] = {1}";
                dataContext.Database.ExecuteSqlRaw(sql, linkid, userid);
            }

            TempData["linkID"] = linkid.ToString();
            TempData["deptid"] = depid;
            TempData["subdeptid"] = subdepid.ToString();
            return RedirectToAction("Index");
        }

        public void LoadDocumentAccess(long linkID)
        {
            ViewBag.linkid = linkID;
            ViewData["Users"] = dataContext.Users.ToList();
            ViewData["selectedDocumentAccess"] = dataContext.DocumentAccess.Where(p => p.LinkID == linkID && p.Active == true);
            var users = dataContext.Users.Where(p => p.Active == true).ToList();
            var docuAccess = dataContext.DocumentAccess.Where(p => p.LinkID == linkID && p.Active == true).ToList();

            for (var i = 0; i < docuAccess.Count; i++)
            {
                for (var j = 0; j < users.Count; j++)
                {
                    if (docuAccess[i].UserID == users[j].ID)
                    {
                        users.Remove(users[j]);
                    }
                }
            }

            if (users.Count > 0)
            {
                ViewBag.availableUsers = true;
            }
            else
            {
                ViewBag.availableUsers = false;
            }
        }

        public IActionResult AddUser(long linkid ,long subdepid, int depid, long userid)
        {
            var users = dataContext.Users.Where(p => p.Active == true).ToList();
            var docuAccess = dataContext.DocumentAccess.Where(p => p.LinkID == linkid && p.Active == true).ToList();
            var subDep = dataContext.SubDepartment.Where(p => p.ID == subdepid).FirstOrDefault();

            for (var i = 0; i < docuAccess.Count; i++)
            {
                for (var j = 0; j < users.Count; j++)
                {
                    if (docuAccess[i].UserID == users[j].ID)
                    {
                        users.Remove(users[j]);
                    }
                }
            }

            if (userid != 0)
            {
                var selectedUser = users.FirstOrDefault(p => p.ID == userid);
                ViewBag.user = selectedUser.UserName;
                ViewBag.userid = userid;
            }
            else
            {
                ViewBag.user = users[0].UserName;
                ViewBag.userid = users[0].ID;
            }

            ViewData["Users"] = users;
            ViewBag.Subdepartment = subDep.Name;
            ViewBag.linkid = linkid;
            ViewBag.depid = depid;
            ViewBag.subdepid = subdepid;

            return View(); 
        }

        [HttpPost]
        [AutoValidateAntiforgeryToken]
        public IActionResult AddUser()
        {
            int depid = int.Parse(Request.Form["depid"]);
            long subdepid = long.Parse(Request.Form["subdepid"]);
            long linkid = long.Parse(Request.Form["linkid"]);
            long userid = long.Parse(Request.Form["userid"]);
            bool view = Request.Form["View"] == "true";
            bool add = Request.Form["Add"] == "true";
            bool edit = Request.Form["Edit"] == "true";
            bool delete = Request.Form["Delete"] == "true";
            bool print = Request.Form["Print"] == "true";
            bool confidential = Request.Form["Confidential"] == "true";
            bool comment = Request.Form["Comment"] == "true";
            bool collaborate = Request.Form["Collaborate"] == "true";
            bool finalize = Request.Form["Finalize"] == "true";
            bool masking = Request.Form["Masking"] == "true";

            var createdBy = HttpContext.Session.GetString(SessionKeyName);
            DateTime createdDate = DateTime.Now;

            sql = "SELECT * FROM [Document Access] WHERE [Link ID] = {0} AND [User ID] = {1}";

            var results = dataContext.DocumentAccess
                .FromSqlRaw(sql, linkid, userid)
                .ToList();

            if (results.Count > 0)
            {
                sql = "UPDATE [Document Access] SET Active = {8}, [View] = {2}, [Add] = {3}, [Edit] = {4}, [Delete] = {5}, [Print] = {6}, Confidential = {7}, [Comment] = {8}, [Collaborate] = {9}, [Finalize] = {10}, [Masking] = {11} WHERE [Link ID] = {0} AND [User ID] = {1}";
                dataContext.Database.ExecuteSqlRaw(sql, linkid, userid, view, add, edit, delete, print, confidential, comment, collaborate, finalize, masking, 1);
            }
            else
            {
                sql = "INSERT INTO [Document Access] VALUES({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11}, {12}, {13}, {14})";
                dataContext.Database.ExecuteSqlRaw(sql, linkid, userid, view, add, edit, delete, print, confidential, comment, collaborate, finalize, masking, 1, createdBy, createdDate);
            }

            TempData["linkID"] = linkid.ToString();
            TempData["deptid"] = depid;
            TempData["subdeptid"] = subdepid.ToString();
            return RedirectToAction("Index");
        }

        public IActionResult EditUser(int depid, long subdepid, long linkid)
        {
            var depName = dataContext.Department.FirstOrDefault(p => p.ID == depid);
            var subDepName = dataContext.SubDepartment.FirstOrDefault(p => p.ID == subdepid);
            ViewBag.depname = depName.Name;
            ViewBag.subdepname = subDepName.Name;
            ViewBag.linkid = linkid;
            ViewBag.depid = depid;
            ViewBag.subdepid = subdepid;

            LoadDocumentAccess(linkid);
            return View();
        }

        [HttpPost]
        public IActionResult EditUser()
        {
            int depid = int.Parse(Request.Form["depid"]);
            long subdepid = long.Parse(Request.Form["subdepid"]);
            long linkid = long.Parse(Request.Form["linkid"]);
            
            var selectedUsers = dataContext.DocumentAccess.Where(p => p.LinkID == linkid).ToList();

            foreach (var user in selectedUsers)
            {
                bool view = Request.Form[$"View{user.UserID}"] == "true";
                bool add = Request.Form[$"Add{user.UserID}"] == "true";
                bool edit = Request.Form[$"Edit{user.UserID}"] == "true";
                bool delete = Request.Form[$"Delete{user.UserID}"] == "true";
                bool print = Request.Form[$"Print{user.UserID}"] == "true";
                bool confidential = Request.Form[$"Confidential{user.UserID}"] == "true";

                sql = "UPDATE [Document Access] SET [View] = {2}, [Add] = {3}, [Edit] = {4}, [Delete] = {5}, [Print] = {6}, Confidential = {7} WHERE [Link ID] = {0} AND [User ID] = {1}";
                dataContext.Database.ExecuteSqlRaw(sql, linkid, user.UserID, view, add, edit, delete, print, confidential);
            }

            var depName = dataContext.Department.FirstOrDefault(p => p.ID == depid);
            var subDepName = dataContext.SubDepartment.FirstOrDefault(p => p.ID == subdepid);
            ViewBag.depname = depName.Name;
            ViewBag.subdepname = subDepName.Name;
            ViewBag.linkid = linkid;
            ViewBag.depid = depid;
            ViewBag.subdepid = subdepid;

            ViewBag.alert = "<span class='text-success'>User Access Successfully Changed</span>";

            LoadDocumentAccess(linkid);
            return View();
        }

        public IActionResult cbxDepartment(int depid)
        {
            TempData["depid"] = depid;
            return RedirectToAction("Index");
        }

        [HttpPost]
        public IActionResult Search(string inputValue)
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

        public IActionResult Fields()
        {
            if (TempData["alert"] != null)
                ViewBag.alert = TempData["alert"];

            if (TempData["linkid"] != null)
            {
                var linkid = TempData["linkid"].ToString();
                var depid = TempData["depid"];
                var subdepid = TempData["subdepid"].ToString();

                var department = dataContext.Department.FirstOrDefault(p => p.ID == (int)depid);
                var subdepartment = dataContext.SubDepartment.FirstOrDefault(p => p.ID == long.Parse(subdepid));
                var fields = dataContext.Fields.Where(p => p.LinkID == long.Parse(linkid)).ToList();

                ViewBag.depid = depid;
                ViewBag.subdepid = subdepid;
                ViewBag.linkid = linkid;

                foreach (var field in fields)
                {
                    if (field.FieldNumber == -1)
                        ViewBag.fileDesc = field.Description;

                    if (field.FieldNumber == 0)
                        ViewBag.fileDate = field.Description;

                    for (int i = 1; i <= 10; i++)
                    {
                        if (i == field.FieldNumber)
                        {
                            ViewData[$"input{i}"] = field.Description;
                            ViewData[$"active{i}"] = field.Active;
                            ViewData[$"dType{i}"] = field.DataType;
                        }   
                    }
                    
                    if (field.FieldNumber == 11)
                    {
                        ViewData["active11"] = field.Active;
                        ViewData["input11"] = field.Description;
                    }  
                }

                ViewBag.depname = department.Name;
                ViewBag.subdepname = subdepartment.Name;
            }
            else
            {
                return RedirectToAction("Index");
            }
            return View();
        }

        public IActionResult LoadFields(int depid, long subdepid, long linkid)
        {
            TempData["depid"] = depid;
            TempData["subdepid"] = subdepid.ToString();
            TempData["linkid"] = linkid.ToString();
            return RedirectToAction("Fields");
        }

        [HttpPost]
        public IActionResult LoadFields()
        {
            int depid = int.Parse(Request.Form["depid"]);
            long subdepid = long.Parse(Request.Form["subdepid"]);
            long linkid = long.Parse(Request.Form["linkid"]);

            for (int i = -1; i <= 11; i++)
            {
                string description, dataType;
                bool active;
                if (i == -1)
                {
                    description = Request.Form[$"input{i}"].ToString();
                    sql = "UPDATE Fields SET Description = {0} WHERE [Link ID] = {1} AND [Field Number] = {2}";
                    dataContext.Database.ExecuteSqlRaw(sql, description, linkid, i);
                }
                else if (i == 0)
                {
                    description = Request.Form[$"input{i}"].ToString();
                    sql = "UPDATE Fields SET Description = {0} WHERE [Link ID] = {1} AND [Field Number] = {2}";
                    dataContext.Database.ExecuteSqlRaw(sql, description, linkid, i);
                }
                else if (i == 11)
                {
                    description = Request.Form[$"input{i}"].ToString();
                    dataType = "Number";
                    active = Request.Form[$"active{i}"] == "true";
                    sql = "UPDATE Fields SET Active = {0}, Description = {1}, [Data Type] = {2} WHERE [Link ID] = {3} AND [Field Number] = {4}";
                    dataContext.Database.ExecuteSqlRaw(sql, active, description, dataType, linkid, i);
                }
                else
                {
                    description = Request.Form[$"input{i}"].ToString();
                    dataType = Request.Form[$"dType{i}"].ToString();
                    active = Request.Form[$"active{i}"] == "true";
                    sql = "UPDATE Fields SET Active = {0}, Description = {1}, [Data Type] = {2} WHERE [Link ID] = {3} AND [Field Number] = {4}";
                    dataContext.Database.ExecuteSqlRaw(sql, active, description, dataType, linkid, i);
                }
            }

            TempData["alert"] = "<span class='text-success'>Fields updated</span>";
            TempData["depid"] = depid;
            TempData["subdepid"] = subdepid.ToString();
            TempData["linkid"] = linkid.ToString();
            return RedirectToAction("Fields");
        }
    }
}
