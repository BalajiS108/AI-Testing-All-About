package tests;

import java.time.Duration;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.testng.Assert;
import org.testng.annotations.AfterTest;
import org.testng.annotations.BeforeTest;
import org.testng.annotations.Test;
import pages.LoginPage;

public class LoginTests {
    private WebDriver driver;
    private LoginPage loginPage;

    @BeforeTest
    public void setupDriver() {
        try {
            ChromeOptions options = new ChromeOptions();
            options.addArguments("--remote-allow-origins=*");
            driver = new ChromeDriver(options);
            driver.manage().window().maximize();
            driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(60));
            loginPage = new LoginPage(driver);
        } catch (Exception e) {
            throw new RuntimeException("Driver Initialization Failed", e);
        }
    }

    @org.testng.annotations.BeforeMethod
    public void navigateToLogin() {
        driver.get("https://login.salesforce.com/?locale=in");
    }

    @Test(priority = 1)
    public void testInvalidLogin() {
        try {
            loginPage.doLogin("invalid.user@salesforce.com", "WrongPassword");
            Assert.assertTrue(loginPage.isErrorMessageDisplayed(), "Error message not displayed for invalid login.");
            String errorText = loginPage.getErrorMessage();
            Assert.assertTrue(errorText.contains("check your username and password"),
                    "Unexpected error message: " + errorText);
        } catch (RuntimeException e) {
            Assert.fail("Invalid login test encountered an exception: " + e.getMessage());
        }
    }

    @Test(priority = 2)
    public void testValidLogin() {
        try {
            loginPage.doLogin("valid.user@salesforce.com", "SecurePassword123!");
            Assert.assertFalse(loginPage.isErrorMessageDisplayed(), "Error message appeared for valid user.");
        } catch (RuntimeException e) {
            Assert.fail("Valid login test encountered an exception: " + e.getMessage());
        }
    }

    @AfterTest
    public void teardown() {
        if (driver != null) {
            try {
                driver.quit();
            } catch (Exception e) {
                System.err.println("Driver teardown failed: " + e.getMessage());
            }
        }
    }
}
