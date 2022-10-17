// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import crypto from "crypto";
import { BigNumber, Wallet } from "ethers";
import * as fs from "fs";
import { ethers } from "hardhat";
import { join } from "path";
import { start } from "repl";
import { assessProposal } from "../test/VoteHelper";
import {
    CommonsBudget__factory as CommonsBudgetFactory,
    VoteraVote__factory as VoteraVoteFactory,
} from "../typechain-types";
import { GasPriceManager } from "../utils/GasPriceManager";

import { NonceManager } from "@ethersproject/experimental";

import { getSigners, getValidators } from "../utils/CommonUtil";

const AddressZero = "0x0000000000000000000000000000000000000000";
const InvalidProposal = "0x43d26d775ef3a282483394ce041a2757fbf700c9cf86accc6f0ce410accf123f";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

interface IValidatorInfo {
    index: number;
    privateKey: string;
    address: string;
}

function getNewProposal() {
    for (;;) {
        const proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
        if (proposal !== InvalidProposal) {
            return proposal;
        }
    }
}

async function main() {
    // boiler-plate
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const voteraVote = await voteraVoteFactory.attach(process.env.VOTERA_VOTE_CONTRACT || "");
    const provider = ethers.provider;
    const [adminSigner, voteManagerSigner, userSigner, managerSigner, proposerSigner] = await getSigners();
    const vals = await getValidators();
    const basicFee = ethers.utils.parseEther("100.0");
    const fundAmount = ethers.utils.parseEther("10000.0");

    // current proposal ID
    const proposalID = process.env.FUND_PROPOSAL_ID || "";
    console.log("Current proposal ID: ", proposalID);

    const validator_count: number = Number(process.env.VALIDATOR_COUNT || "0");
    const validators = vals.slice(1, validator_count + 1);

    const storageAddress = await commonsBudget.getStorageContractAddress();
    const storageFactory = await ethers.getContractFactory("CommonsStorage");
    const storageContract = await storageFactory.attach(storageAddress);

    // current proposal information
    const proposalData = await commonsBudget.getProposalData(proposalID);

    let assessCount: number;
    let passAssessResult: number[] = [];
    const assessResult = Boolean(JSON.parse(process.env.ASSESS_RESULT || "true"));
    if (assessResult) {
        assessCount = 2;
        passAssessResult = [7, 7, 7, 7, 7];
    } else {
        assessCount = 2;
        passAssessResult = [6, 6, 6, 6, 6];
    }

    // Fund proposal
    if (proposalData.proposalType === 1) {
        for (let i = 0; i < assessCount; i += 1) {
            const valSigner = new NonceManager(new GasPriceManager(provider.getSigner(validators[i].address)));
            const assessVote = VoteraVoteFactory.connect(voteraVote.address, valSigner);
            await assessVote.submitAssess(proposalID, passAssessResult);
        }
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
