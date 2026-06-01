import { remote } from 'webdriverio';

/**
 * Explore the Teams UI hierarchy to find chat-related elements
 */

async function main() {
  let driver;
  let teamsDriver;

  try {
    console.log('Connecting to WinAppDriver...');

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
    
    await driver.deleteSession();
    driver = null;
    
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

    console.log('\n--- Exploring Teams UI ---\n');

    // Search for various potential chat-related elements
    const searches = [
      { name: 'message-body elements', xpath: '//*[contains(@AutomationId, "message")]' },
      { name: 'chat elements', xpath: '//*[contains(@AutomationId, "chat")]' },
      { name: 'conversation elements', xpath: '//*[contains(@AutomationId, "conversation")]' },
      { name: 'text elements with content', xpath: '//Text' },
      { name: 'list items', xpath: '//ListItem' },
    ];

    for (const search of searches) {
      console.log(`\n--- ${search.name} ---`);
      try {
        const elements = await teamsDriver.$$(search.xpath);
        console.log(`Found ${elements.length} elements`);
        
        // Show first 5 elements with their name/automationId
        for (let i = 0; i < Math.min(5, elements.length); i++) {
          try {
            const name = await elements[i].getAttribute('Name');
            const autoId = await elements[i].getAttribute('AutomationId');
            const className = await elements[i].getAttribute('ClassName');
            console.log(`  [${i}] AutomationId: ${autoId || 'N/A'}`);
            console.log(`       ClassName: ${className || 'N/A'}`);
            if (name && name.length < 200) {
              console.log(`       Name: ${name}`);
            } else if (name) {
              console.log(`       Name: ${name.substring(0, 100)}...`);
            }
          } catch (e) {
            // Element stale
          }
        }
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }

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
