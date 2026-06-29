import crypto from "crypto";

class OOPs {
  static PasswordHash = "P@@Sw0rd";
  static SaltKey = "S@LT&KEY";
  static VIKey = "@1B2c3D4e5F6g7H8";

  static getKey() {
    return crypto.pbkdf2Sync(
      this.PasswordHash,
      Buffer.from(this.SaltKey, "ascii"),
      1000,
      32,
      "sha1",
    );
  }

  static encrypt(plainText) {
    try {
      const key = this.getKey();
      const iv = Buffer.from(this.VIKey, "ascii");

      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

      cipher.setAutoPadding(true);

      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(plainText, "utf8")),
        cipher.final(),
      ]);

      return encrypted.toString("base64");
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  static decrypt(encryptedText) {
    try {
      const key = this.getKey();
      const iv = Buffer.from(this.VIKey, "ascii");

      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

      decipher.setAutoPadding(false);

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedText, "base64")),
        decipher.final(),
      ]);

      return decrypted.toString("utf8").replace(/\0+$/g, "");
    } catch (err) {
      console.error("DECRYPT FAILED:", err);
      return null;
    }
  }
}

export default OOPs;
