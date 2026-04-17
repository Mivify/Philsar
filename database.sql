-- 1. Create Database
CREATE DATABASE db_Layda_Lorenzo_Yumul;
USE db_Layda_Lorenzo_Yumul;

-- 2. Create Customers Table
CREATE TABLE tb_Customers (
    CustomerID INT PRIMARY KEY,
    CustomerName VARCHAR(255),
    ContactName VARCHAR(255),
    Address VARCHAR(255),
    City VARCHAR(100),
    PostalCode VARCHAR(20),
    Country VARCHAR(100)
);

-- Insert Sample Data into Customers Table
INSERT INTO tb_Customers VALUES
(1, 'Juan Reason P. Tadeo', 'Maria Juana P. Tadeo', 'Block 1 Lot 1 Phase 1', 'Magalang', '2011', 'India'),
(2, 'John Doe', 'Jane Doe', '123 Main St', 'Los Angeles', '90001', 'USA'),
(3, 'Alice Smith', 'Bob Smith', '456 Elm St', 'New York', '10001', 'USA'),
(4, 'Carlos Santos', 'Mia Santos', '789 Oak St', 'Madrid', '28001', 'Spain'),
(5, 'Liu Wei', 'Zhang Wei', '101 Bamboo Rd', 'Beijing', '100000', 'China'),
(6, 'Fatima Khan', 'Aisha Khan', '15 Crescent Rd', 'Dubai', '00000', 'UAE'),
(7, 'Ricardo Lopez', 'Anna Lopez', '202 Olive St', 'Mexico City', '01000', 'Mexico'),
(8, 'Elena Petrova', 'Ivan Petrov', '32 Red Square', 'Moscow', '101000', 'Russia'),
(9, 'Mohamed Ali', 'Yasmin Ali', '44 Nile St', 'Cairo', '11511', 'Egypt'),
(10, 'Samuel Osei', 'Kwame Osei', '50 Gold Coast Rd', 'Accra', '00233', 'Ghana');

-- Verify Data
SELECT * FROM tb_Customers;

-- 3. Create Categories Table
CREATE TABLE tb_Categories (
    CategoryID INT PRIMARY KEY,
    CategoryName VARCHAR(255),
    Description TEXT
);

INSERT INTO tb_Categories VALUES
(1, 'Beverages', 'Soft drinks, coffees, teas, beers, and ales'),
(2, 'Condiments', 'Sweet and savory sauces, relishes, spreads, and seasonings'),
(3, 'Confections', 'Desserts, candies, and sweet breads'),
(4, 'Dairy Products', 'Cheeses'),
(5, 'Grains/Cereals', 'Breads, crackers, pasta, and cereal'),
(6, 'Meat/Poultry', 'Prepared meats'),
(7, 'Produce', 'Dried fruit and bean curd'),
(8, 'Seafood', 'Seaweed and fish');

SELECT * FROM tb_Categories;

-- 4. Create Employees Table
CREATE TABLE tb_Employees (
    EmployeeID INT PRIMARY KEY,
    FirstName VARCHAR(255),
    MiddleName VARCHAR(255),
    LastName VARCHAR(255),
    Gender VARCHAR(10),
    Age INT
);

INSERT INTO tb_Employees VALUES
(1, 'Juana', 'Toyo', 'Datu Puti', 'Female', 22);

SELECT * FROM tb_Employees;

-- 5. Create OrderDetails Table
CREATE TABLE tb_OrderDetails (
    OrderDetailID INT PRIMARY KEY,
    OrderID INT,
    ProductID INT,
    Quantity INT
);

INSERT INTO tb_OrderDetails VALUES
(1, 10248, 11, 12),
(2, 10248, 42, 10),
(3, 10248, 72, 5),
(4, 10249, 14, 9),
(5, 10249, 51, 40),
(6, 10250, 41, 10),
(7, 10250, 51, 35),
(8, 10250, 65, 15),
(9, 10251, 22, 6);

SELECT * FROM tb_OrderDetails;

-- 6. Create OrderID Table
CREATE TABLE tb_OrderID (
    OrderID INT PRIMARY KEY,
    CustomerID INT,
    EmployeeID INT,
    OrderDate DATE,
    ShipperID INT
);

-- Insert provided data into tb_OrderID
INSERT INTO tb_OrderID VALUES
(10248, 90, 5, '1996-07-04', 3),
(10249, 81, 6, '1996-07-05', 1),
(10250, 34, 4, '1996-07-08', 2),
(10251, 84, 3, '1996-07-08', 1),
(10252, 76, 4, '1996-07-09', 2),
(10253, 34, 3, '1996-07-10', 2),
(10254, 14, 5, '1996-07-11', 2),
(10255, 68, 9, '1996-07-12', 3),
(10256, 88, 3, '1996-07-15', 2),
(10257, 35, 4, '1996-07-16', 3);

-- Verify the inserted data
SELECT * FROM tb_OrderID;

-- 7. Create Products Table
CREATE TABLE tb_Products (
    ProductID INT PRIMARY KEY,
    ProductName VARCHAR(255),
    SupplierID INT,
    CategoryID INT,
    Unit VARCHAR(255),
    Price DECIMAL(10,2)
);

INSERT INTO tb_Products VALUES
(1, 'Chais', 1, 1, '10 boxes x 20 bags', 18.00),
(2, 'Chang', 1, 1, '24 - 12 oz bottles', 19.00),
(3, 'Aniseed Syrup', 1, 2, '12 - 550 ml bottles', 10.00),
(4, 'Chef Anton\'s Cajun Seasoning', 2, 2, '48 - 6 oz jars', 22.00),
(5, 'Chef Anton\'s Gumbo Mix', 2, 2, '36 boxes', 21.35),
(6, 'Grandma\'s Boysenberry Spread', 3, 2, '12 - 8 oz jars', 25.00),
(7, 'Uncle Bob\'s Organic Dried Pears', 3, 7, '12 - 1 lb pkgs.', 30.00),
(8, 'Northwoods Cranberry Sauce', 3, 2, '12 - 12 oz jars', 40.00),
(9, 'Mishi Kobe Niku', 4, 6, '18 - 500 g pkgs.', 97.00),
(10, 'Ikura', 4, 8, '12 - 200 ml jars', 31.00);

SELECT * FROM tb_Products;

-- 8. Create Shippers Table
CREATE TABLE tb_Shippers (
    ShipperID INT PRIMARY KEY,
    ShipperName VARCHAR(255),
    Phone VARCHAR(20)
);

INSERT INTO tb_Shippers VALUES
(1, 'Speedy Express', '(503) 555-9831'),
(2, 'United Package', '(503) 555-3199'),
(3, 'Federal Shipping', '(503) 555-9931');

SELECT * FROM tb_Shippers;

-- 9. Create Suppliers Table
CREATE TABLE tb_Suppliers (
    SupplierID INT PRIMARY KEY,
    SupplierName VARCHAR(255),
    ContactName VARCHAR(255),
    Address VARCHAR(255),
    City VARCHAR(100),
    PostalCode VARCHAR(20),
    Country VARCHAR(100),
    Phone VARCHAR(20)
);

INSERT INTO tb_Suppliers VALUES
(1, 'Exotic Liquid', 'Charlotte Cooper', '49 Gilbert St.', 'London', 'EC1 4SD', 'UK', '(171) 555-2222');

SELECT * FROM tb_Suppliers;
-- Updating Order Date
UPDATE tb_OrderID
SET OrderDate = '1996-08-01'
WHERE OrderID = 10248;

-- Updating Product Price
UPDATE tb_Products
SET Price = 25.00
WHERE ProductID = 1;