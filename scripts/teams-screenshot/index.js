import { remote } from 'webdriverio';
import fs from 'fs';

/**
 * Takes a screenshot of just the Microsoft Teams window.
 */

async function main() {
  let driver;
  let teamsDriver;

  try {
    console.log('Connecting to WinAppDriver...');

    // Connect to desktop root
    driver = await remote({
      hostname: '127.0.0.1',
      port: 4723,
      path: '/',
      logLevel: 'silent',
      capabilities: {
        platformName: 'Windows',
        'appium:automationName': 'Windows',
        'appium:app': 'Root',
        'appium:deviceName': 'WindowsPC',
      },
    });

    console.log('Looking for Teams window...');

    const teamsWindows = await driver.$$('//Window[contains(@Name, "Teams")]');
    
    if (teamsWindows.length === 0) {
      throw new Error('Could not find Teams window. Make sure Teams is open and visible.');
    }
    
    const teamsWindow = teamsWindows[0];
    const windowTitle = await teamsWindow.getAttribute('Name');
    console.log(`Found Teams window: "${windowTitle}"`);
    
    const windowHandle = await teamsWindow.getAttribute('NativeWindowHandle');
    const hexHandle = '0x' + parseInt(windowHandle).toString(16);
    
    console.log(`Window handle: ${windowHandle} (${hexHandle})`);
    
    // Close root session
    await driver.deleteSession();
    driver = null;
    
    // Create new session attached to Teams window
    console.log('Attaching to Teams window...');
    teamsDriver = await remote({
      hostname: '127.0.0.1',
      port: 4723,
      path: '/',
      logLevel: 'silent',
      capabilities: {
        platformName: 'Windows',
        'appium:automationName': 'Windows',
        'appium:appTopLevelWindow': hexHandle,
        'appium:deviceName': 'WindowsPC',
      },
    });

    console.log('Taking screenshot of Teams window...');
    const screenshot = await teamsDriver.takeScreenshot();
    
    const filename = `teams-screenshot-${Date.now()}.png`;
    fs.writeFileSync(filename, screenshot, 'base64');
    console.log(`Screenshot saved to ${filename}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (teamsDriver) {
      await teamsDriver.deleteSession();
    }
    if (driver) {
      await driver.deleteSession();
    }
  }
}

main();
