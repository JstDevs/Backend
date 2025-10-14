using System.Security.Cryptography;
using System.Text;

namespace DMS.Controllers
{
    public class EncryptionHelper
    {
        // Define your encryption key here
        private static readonly string EncryptionKey = "BLSPhilippinesCS201122046-008182965";

        public static string FunEncrypt(string clearText)
        {
            byte[] clearBytes = Encoding.Unicode.GetBytes(clearText);

            using (Aes encryptor = Aes.Create())
            {
                // Define the salt as a byte array
                byte[] salt = new byte[] { 0x49, 0x76, 0x61, 0x6E, 0x20, 0x4D, 0x65, 0x64, 0x76, 0x65, 0x64, 0x65, 0x76 };

                // Create a Rfc2898DeriveBytes instance
                using (var pdb = new Rfc2898DeriveBytes(EncryptionKey, salt))
                {
                    encryptor.Key = pdb.GetBytes(32);
                    encryptor.IV = pdb.GetBytes(16);

                    using (var ms = new MemoryStream())
                    {
                        using (var cs = new CryptoStream(ms, encryptor.CreateEncryptor(), CryptoStreamMode.Write))
                        {
                            cs.Write(clearBytes, 0, clearBytes.Length);
                            cs.FlushFinalBlock();
                        }

                        clearText = Convert.ToBase64String(ms.ToArray());
                    }
                }
            }

            return clearText;
        }
    }
}
