import crypto from "crypto";

class OOPs {
  static PasswordHash = "P@@Sw0rd";
  static SaltKey = "S@LT&KEY";
  static VIKey = "@1B2c3D4e5F6g7H8";

  static getKey() {
    return crypto.pbkdf2Sync(this.PasswordHash, this.SaltKey, 1000, 32, "sha1");
  }

  // 🔥 ZERO padding (C# match)
  static zeroPad(buf) {
    const blockSize = 16;
    const pad = blockSize - (buf.length % blockSize || blockSize);
    return Buffer.concat([buf, Buffer.alloc(pad, 0)]);
  }

  static zeroUnpad(buf) {
    let end = buf.length;
    while (end > 0 && buf[end - 1] === 0) {
      end--;
    }
    return buf.slice(0, end);
  }

  static encrypt(plainText) {
    const key = this.getKey();
    const iv = Buffer.from(this.VIKey, "ascii");

    let data = Buffer.from(plainText, "utf8");
    data = this.zeroPad(data);

    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    return encrypted.toString("base64");
  }

  static decrypt(encryptedText) {
    try {
      const key = this.getKey();
      const iv = Buffer.from(this.VIKey, "ascii");

      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

      let decrypted = decipher.update(encryptedText, "base64", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted.replace(/\0/g, "");
    } catch (err) {
      console.log("DECRYPT FAILED:", err.message);
      return null;
    }
  }
}

export default OOPs;
