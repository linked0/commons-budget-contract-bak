import chai, { expect } from "chai";
import crypto from "crypto";
import { solidity } from "ethereum-waffle";
import { BigNumber, BigNumberish, BytesLike, Contract, utils, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import {
    CommonsBudget,
    CommonsBudget__factory as CommonsBudgetFactory,
    VoteraVote,
    VoteraVote__factory as VoteraVoteFactory,
    CBudget,
    CBudget__factory as CBudgetFactory,
    CBudgetV2,
    CBudgetV2__factory as CBudgetV2Factory,
    CStorage,
    CStorage__factory as CStorageFactory,
} from "../typechain";

const AddressZero = "0x0000000000000000000000000000000000000000";
const InvalidProposal = "0x43d26d775ef3a282483394ce041a2757fbf700c9cf86accc6f0ce410accf123f";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

chai.use(solidity);

function getNewProposal() {
    for (;;) {
        const proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
        if (proposal !== InvalidProposal) {
            return proposal;
        }
    }
}

async function displayBalance(address: string, message: string) {
    const balance = await ethers.provider.getBalance(address);
    console.log(`${message}_balance = ${balance.toString()}`);
}

describe.only("CommonsBudget (proxy) V2", () => {
    const { provider } = waffle;
    const [admin, voteManager, ...richValidators] = provider.getWallets();
    const adminSigner = provider.getSigner(admin.address);
    const basicFee = ethers.utils.parseEther("10000.0");
    const fundAmount = ethers.utils.parseEther("10000.0");


    // create more validators and have 100 validators in total
    let validators: Wallet[] = [];
    validators = validators.concat(richValidators);
    for (let i = validators.length; i < 100; i += 1) {
        validators = validators.concat(provider.createEmptyWallet());
    }

    let commonsBudget: Contract;
    let commonsBudget2: Contract;

    beforeEach(async function () {
        const budgetFactory = await ethers.getContractFactory("CBudget");
        const budgetV2Factory = await ethers.getContractFactory("CBudgetV2");

        // initilize with 42
        commonsBudget = await upgrades.deployProxy(budgetFactory, { kind: 'uups' });
        console.log(commonsBudget.address, " CommonsBudget/proxy");
        let implAddress = await upgrades.erc1967.getImplementationAddress(commonsBudget.address);
        console.log(implAddress, " getImplementationAddress");
        let adminAddress = await upgrades.erc1967.getAdminAddress(commonsBudget.address);
        console.log(adminAddress, " getAdminAddress");
        await commonsBudget.set(100);
        let value = await commonsBudget.get();
        console.log("value of CommonsBudget: ", value);

        // send 1 million BOA to CommonsBudget contract
        const commonsFund = BigNumber.from(10).pow(18).mul(500000);
        for (let i = 0; i < 2; i++) {
            await provider.getSigner(richValidators[i].address).sendTransaction({
                to: commonsBudget.address,
                value: commonsFund,
            });
        }

        await provider.getSigner(richValidators[2].address).sendTransaction({
            to: implAddress,
            value: commonsFund,
        });

        displayBalance(commonsBudget.address, "Bal of proxy");
        displayBalance(implAddress, "Bal of impl");

        const validatorBudget = CBudgetFactory.connect(commonsBudget.address, validators[0]);
        const makeProposalTx = await validatorBudget.createFundProposal(
            DocHash,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        displayBalance(commonsBudget.address, "Bal of proxy");
        displayBalance(implAddress, "Bal of impl");
        displayBalance(validators[0].address, "Bal of validator");
        value = await validatorBudget.get();
        console.log("value of CommonsBudget 2: ", value);

        await validatorBudget.sendFund(validators[0].address);
        displayBalance(commonsBudget.address, "Bal of proxy last call");
        displayBalance(implAddress, "Bal of impl last call");
        displayBalance(validators[0].address, "Bal of validator last call");

        commonsBudget2 = await upgrades.upgradeProxy(commonsBudget.address, budgetV2Factory);
        console.log(commonsBudget2.address, " CommonsBudget/proxy after upgrade");
        console.log(await upgrades.erc1967.getImplementationAddress(commonsBudget2.address), " getImplementationAddress after upgrade");
        console.log(await upgrades.erc1967.getAdminAddress(commonsBudget2.address), " getAdminAddress after upgrade");

        value = await validatorBudget.get();
        console.log("value of CommonsBudgetV2 2: ", value);
        displayBalance(commonsBudget.address, "Bal of proxy last call 2");
        displayBalance(implAddress, "Bal of impl last call 2");
        displayBalance(validators[0].address, "Bal of validator last call 2");
    });

    it("should retrieve value previously stored and increment correctly", async function () {
        // let value = await commonsBudget2.get();
        // console.log("value onf CommonsBudgetV2: ", value);
        // console.log("value onf CommonsBudgetV2: ", 2);
    });
});