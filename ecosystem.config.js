module.exports = {
  apps: [
    {
      name: "hr-api",
      cwd: "/var/www/hr-portal/server",   // <-- apne project ka path dalna
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        MONGO_URI: "mongodb+srv://hrdepartmentfintradify:***@tradify9.swynxaa.mongodb.net/?retryWrites=true&w=majority&appName=Tradify9",
        JWT_SECRET: "11412c5128d90f836987b04cccb40...",
        EMAIL_USER: "fintradiify@gmail.com",
        EMAIL_PASS: "xlfm mwzq jmbj tgcw",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: 587,
        CORS_ORIGIN: "https://crm.fintradify.com"
      }
    }
  ]
}
