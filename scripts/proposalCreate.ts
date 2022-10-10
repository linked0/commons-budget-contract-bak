// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import crypto from "crypto";
import { BigNumber, BigNumberish, BytesLike, Wallet } from "ethers";
import * as fs from "fs";
import { ethers } from "hardhat";
import { join } from "path";
import { start } from "repl";
import { CommonsBudget__factory as CommonsBudgetFactory } from "../typechain-types";
import { GasPriceManager } from "../utils/GasPriceManager";

import { NonceManager } from "@ethersproject/experimental";

import { displayBalance, getSigners, getValidators } from "../utils/CommonUtil";

const AddressZero = "0x0000000000000000000000000000000000000000";
const InvalidProposal = "0x43d26d775ef3a282483394ce041a2757fbf700c9cf86accc6f0ce410accf123f";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

function getNewProposal() {
    for (;;) {
        const proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
        if (proposal !== InvalidProposal) {
            return proposal;
        }
    }
}

function toFundInput(
    title: string,
    start: number,
    end: number,
    startAssess: number,
    endAssess: number,
    docHash: BytesLike,
    amount: BigNumberish
) {
    return { start, end, startAssess, endAssess, docHash, amount, title };
}

function signFundProposal(
    signer: Wallet,
    proposalID: string,
    title: string,
    start: BigNumberish,
    end: BigNumberish,
    startAssess: BigNumberish,
    endAssess: BigNumberish,
    docHash: string,
    amount: BigNumberish,
    proposer: string
): Promise<string> {
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "string", "uint64", "uint64", "uint64", "uint64", "bytes32", "uint256", "address"],
        [proposalID, title, start, end, startAssess, endAssess, docHash, amount, proposer]
    );
    const sig = signer._signingKey().signDigest(ethers.utils.keccak256(encodedResult));
    return Promise.resolve(ethers.utils.joinSignature(sig));
}

async function main() {
    // boiler-plate
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
    const commonsBudgetAddress = process.env.COMMONS_BUDGET_CONTRACT || "";
    const commonsBudget = await commonsBudgetFactory.attach(commonsBudgetAddress);
    const provider = ethers.provider;
    const [adminSigner, _, userSigner, managerSigner, proposerSigner] = await getSigners();
    const vals = await getValidators();
    const basicFee = ethers.utils.parseEther("10.0");
    const fundAmount = ethers.utils.parseEther("10000.0");
    const proposalID = getNewProposal();
    console.log("New Proposal ID: ", proposalID);

    const validator_count: number = Number(process.env.VALIDATOR_COUNT || "0");
    const validators = vals.slice(1, validator_count + 1);

    const proposalAddress = await proposerSigner.getAddress();
    await displayBalance(proposalAddress, "Proposal");

    const voteManager = new Wallet(process.env.VOTE_KEY || "");
    const voteManagerSigner = new NonceManager(new GasPriceManager(provider.getSigner(voteManager.address)));
    const voteraVote = await voteraVoteFactory.attach(process.env.VOTERA_VOTE_CONTRACT || "");

    // create fund proposal
    const blockLatest = await ethers.provider.getBlock("latest");
    console.log("Current block - number: ", blockLatest.number, ", timestamp: ", blockLatest.timestamp);
    const title = "FundProposalTitle-2";
    const startAssess = blockLatest.timestamp;
    const endAssess = startAssess + 180; // 3 minutes
    const startTime = endAssess + 180;
    const endTime = startTime + 600;

    const signProposal = await signFundProposal(
        voteManager,
        proposalID,
        title,
        startTime,
        endTime,
        startAssess,
        endAssess,
        DocHash,
        fundAmount,
        proposalAddress
    );

    const proposerBudget = CommonsBudgetFactory.connect(commonsBudgetAddress, proposerSigner);
    const makeProposalTx = await proposerBudget.createFundProposal(
        proposalID,
        toFundInput(title, startTime, endTime, startAssess, endAssess, DocHash, fundAmount),
        signProposal,
        { value: basicFee }
    );
    await makeProposalTx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
