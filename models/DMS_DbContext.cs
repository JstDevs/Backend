using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace DMS.Models
{
    public class DMS_DbContext : DbContext 
    {
        public DMS_DbContext(DbContextOptions<DMS_DbContext> options)
            :base(options)
        {
        }

        public DbSet<UsersModel> Users { get; set; } = default!;

        public DbSet<DepartmentModel> Department { get; set; } = default!;

        public DbSet<SubDepartmentModel> SubDepartment { get; set; } = default!;

        public DbSet<UserAccessModel> UserAccess { get; set; } = default!;

        public DbSet<ModuleAccessModel> ModuleAccess { get; set; } = default!;

        public DbSet<ModuleModel> Module { get; set; } = default!;

        public DbSet<AssignSubDepartmentModel> AssignSubdepartment { get; set; } = default!;

        public DbSet<DocumentAccessModel> DocumentAccess { get; set; } = default!;

        public DbSet<FieldsModel> Fields { get; set; } = default!;

        public DbSet<BarangayModel> Barangay { get; set; } = default!;

        public DbSet<MunicipalityModel> Municipality { get; set; } = default!;

        public DbSet<RegionModel> Region { get; set; } = default!;

        public DbSet<CustomerModel> Customer { get; set; } = default!;

        public DbSet<EmployeeModel> Employee { get; set; } = default!;

        public DbSet<VendorModel> Vendor { get; set; } = default!;

        public DbSet<LGUModel> LGU { get; set; } = default!;

        public DbSet<DocumentsModel> Documents { get; set; } = default!;

        public DbSet<AttachmentModel> Attachment { get; set; } = default!;
    }
}
