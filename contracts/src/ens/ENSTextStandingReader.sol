// SPDX-License-Identifier: MIT
// ─────────────────────────────────────────────────────────────
// Perjury — ENSTextStandingReader.sol
// Provenance: AI-ASSISTED.
//   Human-specified: eligibility must be a pure function of the
//     ENS record at the instant of assignment — no cache, no cron,
//     no admin. This is what makes exclusion a consequence of the
//     record rather than of an operator transaction.
//   AI-implemented: direct resolver text() read + int parsing,
//     deliberately avoiding a universal-resolver CCIP-read hop to
//     keep the VRF callback within its gas limit (docs §4.3).
// ─────────────────────────────────────────────────────────────
pragma solidity 0.8.26;

import {IStandingReader, ITextResolver} from "../interfaces/IPerjury.sol";

contract ENSTextStandingReader is IStandingReader {
    string public constant STANDING_KEY = "perjury.standing";

    ITextResolver public immutable resolver;

    constructor(ITextResolver resolver_) {
        resolver = resolver_;
    }

    function standingOf(bytes32 node) external view returns (int256) {
        string memory raw = resolver.text(node, STANDING_KEY);
        bytes memory b = bytes(raw);
        if (b.length == 0) return 0;
        bool neg = b[0] == "-";
        int256 v;
        for (uint256 i = neg ? 1 : 0; i < b.length; ++i) {
            uint8 ch = uint8(b[i]);
            if (ch < 48 || ch > 57) return 0;
            v = v * 10 + int256(uint256(ch - 48));
        }
        return neg ? -v : v;
    }
}
