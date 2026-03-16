# Salesforce Login Automation Framework

This project is an enterprise-grade automation framework for the Salesforce Login page (`login.salesforce.com`), built using **Selenium WebDriver**, **Java**, **TestNG**, and **Maven**. It utilizes the **Page Object Model (POM)** design pattern with **PageFactory** for efficient element management and maintenance.

## 🚀 Features
- **Page Object Model (POM):** Clean separation of page objects and test logic.
- **PageFactory:** Optimized initialization of web elements.
- **TestNG Integration:** Robust test execution with Annotations (`@Test`, `@BeforeMethod`, `@AfterMethod`).
- **Robust Exception Handling:** structured `try-catch` blocks for stability.
- **Standard Locator Strategy:** Exclusively uses **XPath** for reliability.
- **Explicit Waits:** Uses `WebDriverWait` for synchronization (No `Thread.sleep`).

---

## 🤖 The RICE-POT Prompt Framework
This project was generated using a highly specific prompt structure known as **RICE-POT**. This framework ensures that AI generated code meets specific enterprise standards by providing full context and constraints.

### **RICE-POT Breakdown**

| Letter | Component | Description |
| :--- | :--- | :--- |
| **R** | **Role** | Defines the persona the AI should adopt (e.g., Expert QA Automation Engineer). |
| **I** | **Instructions** | Specific, step-by-step commands and constraints (e.g., Mandatory rules, "Don't" lists). |
| **C** | **Context** | Background information to help the AI understand the *why* and *where* (e.g., Salesforce Login Page description). |
| **E** | **Example** | Providing a code snippet or format to guide the style (e.g., PageFactory example). |
| **P** | **Parameters** | Constraints on quality, accuracy, and style (e.g., Production-level code, zero bad practices). |
| **O** | **Output** | Defines exactly what artifacts to produce (e.g., Only code, no comments). |
| **T** | **Tone** | The style of communication (e.g., Technical, precise, code-only). |

---

## 📝 The Exact Prompt Used
Below is the actual prompt used to generate this framework. You can use this as a template for your own projects.

```text
Role : you are a QA automation tester with 15 years of experience. You have a very good understanding of IT, CRM projects like salesforce.com. You need to create a framework with Selenium, Java, Maven, TestNG, and it should be enterprise-level framework that we need to create.

I - Instructions

Generate a Complete Selenium with Java automation script following the standard of enterprise level standards.
Automate and verify the results of the login page login.salesforce.com/?locale=in, ensure that UI is thoroughly tested with valid and invalid testcases.
[Critical] - Apply the TestNG annotations, @Test, @BeforeTest and others and and necessary setup/teardown logic.
[Critical] Implement robust exception handling within both Page Object model and test scripts using structured try–catch blocks or explicit exception signatures.
[Mandatory] Use Page Object Model with PageFactory, including @FindBy, constructor initialization, and reusable action methods.
[Mandatory] - It is important that you use only the xpath not the css selectors.
[Mandatory] - Please add an Allure report with test engine.
[Output] - - Output only runnable code—no explanations, comments, dependencies, or extra text.
[Don't] - Don't use the css selectors, ID, name and others things.
[Don't] - Don't add comments, Thread.sleep and other bad coding practice.
[Generate] - Generate the 2 scritps only with the valid and invalid testcases of the login page.
[DoNOTuse] Thread.sleep() anywhere; rely on WebDriverWait or implicit waits.
Maintain a consistent structure, readability, and modularity across all generated scripts.

C — Context 
You are creating a login page scripts with proper framework for the sales force login, which is a AB Testing website with valid and invalid login page where in the login page you have the email, password and submit buttin with remember me fucntionality.

E — Example 
Example structure for PageFactory:

public class LoginPage { 
    @FindBy(xpath = "//input[@id='username']") WebElement username;
    @FindBy(xpath = "//input[@id='password']") WebElement password;
    @FindBy(xpath = "//input[@id='Login']") WebElement loginButton;

    public LoginPage(WebDriver driver) { PageFactory.initElements(driver, this); }

    public void doLogin(String user, String pass) { 
        username.sendKeys(user); 
        password.sendKeys(pass); 
        loginButton.click(); 
    }
}

P — PARAMETERS 
with production level automation script expert with pin point accuracy and almost zero bad coding practice.

O — Output 
Provide only:
1 Page Object file
2 TestNG test scripts
Maven project 
No explanations or additional content. 

T — Tone 
Technical, precisly, enterprise-grade, code-one.

Please make the entire step by step process and ask me what you are doing and explain to me also what you are doing step by step. Make sure that you first plan everything and show me what exactly you are going to create. Then only you are going to create afterwards step by step.
```

## 📂 Project Structure
```
src/
├── main/
│   └── java/
│       └── com/salesforce/pages/
│           └── LoginPage.java       # Page Factory Elements & Methods
└── test/
    └── java/
        └── com/salesforce/
            ├── base/
            │   └── BaseTest.java    # WebDriver Setup & Teardown
            └── tests/
                └── LoginTest.java   # Valid & Invalid Test Cases
pom.xml                              # Maven Dependencies
testng.xml                           # Test Suite Configuration
```