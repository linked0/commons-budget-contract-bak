// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { CommonsBudget, VoteraVote } from "../typechain";

import { Wallet } from "ethers";
import { ethers } from "hardhat";

async function main() {
    const CommonsBudget = await ethers.getContractFactory("CommonsBudget");
    const VoteraVote = await ethers.getContractFactory("VoteraVote");

    const provider_ethnet = ethers.provider;

    const admin = new Wallet(process.env.ADMIN_KEY || "");
    const adminSigner = provider_ethnet.getSigner(admin.address);
    const commonsBudget = (await CommonsBudget.connect(adminSigner).deploy()) as CommonsBudget;
    await commonsBudget.deployed();

    const voteManager = new Wallet(process.env.VOTE_KEY || "");
    const voteManagerSigner = provider_ethnet.getSigner(voteManager.address);
    const voteraVote = (await VoteraVote.connect(voteManagerSigner).deploy()) as VoteraVote;
    await voteraVote.deployed();

    await commonsBudget.changeVoteParam(voteManager.address, voteraVote.address);
    await voteraVote.changeCommonBudgetContract(commonsBudget.address);

    console.log("commonsBudget - deployed to:", commonsBudget.address);
    console.log("voteraVote    - deployed to:", voteraVote.address);
    if (!process.env.VOTE_KEY) {
        console.log("voteraVote.manager - privateKey:", voteManager.privateKey);
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
