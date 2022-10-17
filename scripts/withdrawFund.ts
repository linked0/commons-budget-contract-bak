// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { expect } from "chai";
import crypto from "crypto";
import { BigNumber, BigNumberish, Wallet } from "ethers";
import * as fs from "fs";
import { ethers } from "hardhat";
import { join } from "path";
import { start } from "repl";
import {
    CommonsBudget__factory as CommonsBudgetFactory,
    VoteraVote__factory as VoteraVoteFactory,
} from "../typechain-types";
import { GasPriceManager } from "../utils/GasPriceManager";

import { NonceManager } from "@ethersproject/experimental";

import { getSigners, getValidators } from "../utils/CommonUtil";

async function main() {
    // boiler-plate
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const voteraVote = await voteraVoteFactory.attach(process.env.VOTERA_VOTE_CONTRACT || "");
    const provider = ethers.provider;
    const [adminSigner, voteManagerSigner, userSigner, managerSigner, proposerSigner] = await getSigners();

    // current proposal ID
    const proposalID = process.env.FUND_PROPOSAL_ID || "";
    console.log("Current proposal ID: ", proposalID);

    // withdraw
    const proposerBudget = commonsBudget.connect(proposerSigner);
    const [stateCode, _] = await proposerBudget.checkWithdrawState(proposalID);
    console.log("Withdrawal stateCode:", stateCode);
    await expect(proposerBudget.withdraw(proposalID)).to.emit(proposerBudget, "FundTransfer").withArgs(proposalID);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
