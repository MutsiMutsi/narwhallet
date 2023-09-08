var price = 0;
var walletBalance = 0;

let iframe = document.getElementById('sandboxFrame');
let mainContent;
let currentSubContent;

function nknToHuman(amount) {
    if (amount > 10) {
        // Format the price above to USD using the locale, style, and currency.
        let USDollar = new Intl.NumberFormat('en-US');
        return USDollar.format(amount);
    } else {
        return amount.toFixed(8);
    }
}

function nknToUsd(amount) {
    // Format the price above to USD using the locale, style, and currency.
    let USDollar = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });

    return USDollar.format(amount * price);
}

async function fetchLatestPrice() {
    // If last price is recent use that:
    const lastPrice = await chrome.storage.local.get("lastPrice");
    if (lastPrice && Date.now() - lastPrice.lastUpdated < 60000) {
        price = lastPrice.value;
        return;
    }

    // Else fetch and store new latest price.
    var data = await fetch('https://min-api.cryptocompare.com/data/price?fsym=NKN&tsyms=USD');
    dataJSON = await data.json();
    chrome.storage.local.set(
        {
            lastPrice: { lastUpdated: Date.now(), value: dataJSON['USD'] }
        },
        null
    );
    price = dataJSON['USD'];
}



window.onload = async function () {
    var existingWallet = await openAccount('main');

    if (!existingWallet) {
        //Show the splash screen!
        document.getElementById('SplashContent').style.display = 'block';

        let accountLoadedPromise = new Promise((resolve, _) => {
            //Valid seed provided
            document.getElementById('SeedInput').addEventListener('input', async (e) => {
                if (validateTransactionHexValue(e.target.value)) {
                    await createNewAccount('main', e.target.value, '');
                    resolve(true);
                }
            });

            //Seed generated
            document.getElementById('GenerateSeedButton').addEventListener('click', async () => {
                await createNewAccount('main', '', '');
                resolve(true);
            });
        });

        //Clear out the input so that seed isnt cached anywhere!
        document.getElementById('SeedInput').value = '';

        walletBalance = 0.0;
        await accountLoadedPromise;
        await openAccount('main');
    }

    //Wallet should be created or loaded at this point, start the dashboard!
    StartDashboard();

    postToSandbox({ cmd: 'getAddress' }).then((addr) => {
        initializeReceive(addr);
    });
    postToSandbox({ cmd: 'getBalance' }).then((balance) => {
        walletBalance = balance;
        setInterval(() => {
            displayBalance = displayBalance * 0.8 + walletBalance * 0.2;
            setBalanceBoxDisplayValue(displayBalance);
        }, 1.0 / 60.0);
    });
    postToSandbox({ cmd: 'getFee' }).then((fee) => {

        let minNits = +fee.min * Math.pow(10, 8);
        let maxNits = +fee.max * Math.pow(10, 8);
        let avgNits = Math.floor((minNits + maxNits) / 2);

        document.getElementById('minimumFee').innerText = `slow (${minNits})`;
        document.getElementById('averageFee').innerText = `average (${avgNits})`;
        document.getElementById('maximumFee').innerText = `fast (${maxNits})`;

        feeSelect.min = minNits;
        feeSelect.max = maxNits;
    });
};

function focusSubContent(subContent) {
    mainContent.style.right = "100%";
    currentSubContent = subContent;
    currentSubContent.style.visibility = 'visible';
    currentSubContent.style.right = 0.0;
    setTimeout(() => {
        mainContent.style.visibility = 'hidden';
    }, 333);
}

function focusMainContent() {
    mainContent.style.visibility = 'visible';
    mainContent.style.right = "0%";
    currentSubContent.style.right = '-100%';
    setTimeout(() => {
        currentSubContent.style.visibility = 'hidden';
    }, 333);
}

async function postToSandbox(message) {
    return new Promise((resolve, _) => {
        //listen for sandbox reply
        window.addEventListener('message', function messageHandler(event) {
            if (event.data.cmd == message.cmd) {
                //cleanup and resolve
                this.window.removeEventListener('message', messageHandler);
                resolve(event.data.reply);
            }
        });
        //post message to sandbox
        iframe.contentWindow.postMessage(message, "*");
    });
}

function validateTransactionHexValue(hexValue) {
    // Check if the string length is 64 characters.
    if (hexValue.length !== 64) {
        return false;
    }
    // Check if all characters in the string are hexadecimal digits.
    for (let i = 0; i < hexValue.length; i++) {
        if (!/[0-9a-fA-F]/.test(hexValue[i])) {
            return false;
        }
    }

    return true;
}

function validateNameForNns(name) {
    const regex = /(^[A-Za-z0-9][A-Za-z0-9-_+]{5,62}$)/g;
    return name.match(regex) != null;
}


async function deleteAccount(name) {
    await chrome.storage.local.set(
        {
            accountStore: {}
        },
        null
    );
    location.reload();
}

async function openAccount(name) {
    var accounts = await loadAccountStore('');
    var walletJSON = accounts[name];

    let result = await postToSandbox({ cmd: 'openWallet', json: walletJSON, password: '' });
    return result.status == 'SUCCESS';
}

async function loadAccountStore(password) {
    let accountStore = await chrome.storage.local.get(["accountStore"]);
    return accountStore.accountStore ?? {};
}

async function createNewAccount(name, seed, password) {
    var accounts = await loadAccountStore();

    //TODO: Verify name isnt already used!!
    var walletJSON = await postToSandbox({ cmd: 'createWallet', seed: seed, password: '' });
    accounts[name] = walletJSON;

    chrome.storage.local.set(
        {
            accountStore: accounts
        },
        null
    );
}

