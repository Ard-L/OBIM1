# online-banking
Install Node.js and XAMPP, then start Apache and MySQL in the XAMPP control panel.

Download the code:
   git clone https://github.com/Ard-L/OBIM1.git
   cd OBIM1
   npm install
   
Open http://localhost/phpmyadmin, create a database named im1_banking_db, then use Import to load im1_banking_db.sql.

Open config/database.js and check the host, user, password and database name. XAMPP’s default is user root with an empty password.

Start the app with node app.js, then open the address shown in the terminal, usually http://localhost: followed by the port number.
