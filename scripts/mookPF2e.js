import { MookModel, ActionType } from "../../mookAI-12/scripts/mookModel.js";
import { MookModelSettings } from "../../mookAI-12/scripts/mookModelSettings.js";
import { debugLog } from "../../mookAI-12/scripts/behaviors.js";

/* 
   PF2e-specific Mook model that extends the base mookAI model.
   It implements rules for keeping track of Multiple Attack Penalties (MAP), 
   determining strikes (attacks), and handling movement and resource usage.
*/
class MookModelPF2 extends MookModel {
    constructor(token_, settings_, ...args_) {
        super(token_, settings_);
        this.actionsRemaining = 3;
        this.isQuickened = false;
        this.currentMAP = 0;  // Initialize MAP counter
    }

    async doAttack(name_) {
        // Retrieve the actor
        const actor = this.token.actor;
        if (!actor) {
            console.warn("mookAI | Actor not found for token.");
            return;
        }

        // Find the strike action by name
        const strike = actor.system.actions.find(action =>
            action.type === "strike" && 
            action.weapon.name && 
            action.weapon.name.toLowerCase() === name_.toLowerCase()
        );

        if (strike) {
            // Get the appropriate variant based on currentMAP
            // PF2e system provides variants[0] for first attack, [1] for second, [2] for third
            const variantIndex = Math.min(this.currentMAP, 2);
            const strikeVariant = strike.variants[variantIndex] || strike.variants[0];

            const options = {
                skipDialog: true,
                event: new Event(''), // Required for some FoundryVTT functions
            };
			// Note that target is already set on the token so no need to set it here
            await strikeVariant.roll(options);
            this.currentMAP++;
        } else {
            console.warn(`mookAI | Strike "${name_}" not found on actor.`);
        }
    }

    async attack(action_) {
        if (action_.actionType !== ActionType.ATTACK) return;
        if (this.actionsRemaining < 1) return;

        const name = action_.data.weapon.weapon.name; // Adjusted to use 'name' property
        await this.doAttack(name);
        this.actionsRemaining--;
    }

    _resetResources() {
        this.actionsRemaining = this.isQuickened ? 4 : 3;
        this.isQuickened = false;
        this.currentMAP = 0;  // Reset MAP counter at start of turn
    }

    _startTurn() {
        // No specific start turn actions needed for PF2
    }

    zoom() {
        if (this.actionsRemaining < 1) return 0;
        this.actionsRemaining--;
        return this.time;
    }

    get meleWeapons() {
        const actor = this.token.actor;
        if (!actor) return [];

        return actor.system.actions.filter(action =>
            action.canStrike &&
            action.weapon.isMelee
        );
    }

    get rangedWeapons() {
        const actor = this.token.actor;
        if (!actor) return [];

        return actor.system.actions.filter(action =>
            action.canStrike &&
            action.weapon.isRanged
        );
    }

    get _hasMele() {
        return this.meleWeapons.length > 0;
    }

    get _hasRanged() {
        return this.rangedWeapons.length > 0;
    }

    get meleRange() {
        const weapon = this.meleWeapon;
        if (!weapon) return this.settings.standardMeleWeaponTileRange;
        const reach = weapon.item.reach || 5; // Default melee reach is 5 feet
        return Math.max(Math.floor(reach / this.gridDistance), 1);
    }

    get rangedRange() {
        const weapon = this.rangedWeapon;
        if (!weapon) return this.settings.standardRangedWeaponTileRange;
        const maxRange = weapon.item.range.max || 100; // Default range if not specified
        return Math.max(Math.floor(maxRange / this.gridDistance), 1);
    }

    get canAttack() {
		// Convert moved tiles into Stride actions
		let speedFeet = this.token.actor.system.attributes.speed.total || 25;
		const speedInTiles = Math.floor(speedFeet / this.gridDistance);
		if (speedInTiles <= 0) return;

		const stridesUsed = Math.ceil(this._movedTiles / speedInTiles);
		// Calculate the remaining actions after using strides
		const actionsRemaining = Math.max(this.actionsRemaining - stridesUsed, 0);

        return actionsRemaining > 0;
    }

    getCurrentHealth(token_ = this.token) {
        return token_.actor.system.attributes.hp.value;
    }

    getMaxHealth(token_ = this.token) {
        return token_.actor.system.attributes.hp.max;
    }

    get time() {
        // Calculate max movement based on speed and remaining actions
        let speedFeet = this.token.actor.system.attributes.speed.total;
        if (!speedFeet) speedFeet = 25;
        const speedInTiles = Math.floor(speedFeet / this.gridDistance);
        return speedInTiles * this.actionsRemaining;
    }

    get zoomsPerTurn() {
        return this.actionsRemaining;
    }

    exploreActions() {
        // Implementing the same logic as the parent class
        return super.exploreActions();
    }

    faceAction(token_) {
        // Implementing the same logic as the parent class
        return super.faceAction(token_);
    }

    meleAttackAction() {
        return { actionType: ActionType.ATTACK, data: { weapon: this.meleWeapon } };
    }

    rangedAttackAction() {
        return { actionType: ActionType.ATTACK, data: { weapon: this.rangedWeapon } };
    }

    randomRotateAction() {
        // Implementing the same logic as the parent class
        return super.randomRotateAction();
    }

    get attacksPerTurn() {
        // In PF2e, this depends on the number of actions and the weapon traits
        // For simplicity, we'll return the number of actions remaining
        return this.actionsRemaining;
    }

    getHealthPercent(token_) {
        return this.getCurrentHealth(token_) / this.getMaxHealth(token_);
    }

    // Helper to get the best melee weapon (strike)
    get meleWeapon() {
        return this.meleWeapons.reduce((best, current) => {
            if (!best || current.totalModifier > best.totalModifier) {
                return current;
            } else {
                return best;
            }
        }, null);
    }

    // Helper to get the best ranged weapon (strike)
    get rangedWeapon() {
        return this.rangedWeapons.reduce((best, current) => {
            if (!best || current.totalModifier > best.totalModifier) {
                return current;
            } else {
                return best;
            }
        }, null);
    }
}


export class MookModelSettingsPF2 extends MookModelSettings
{
	constructor(token_)
	{
		super(token_);

		// In PF2e, characters typically have 3 actions per turn
		this.actionsPerTurn = 3;

		// Most attacks in PF2e cost 1 action
		this.attacksPerAction = 1;
		this.hasFreeAttack = false;
		this.attacksPerFreeAction = 1;
		this.hasBonusAttack = false;
		this.attacksPerBonusAction = 1;
		// Some characters might have reactions
		this.hasReaction = true;

		// Movement is typically 1 action for your speed
		this.movementCost = 1;

		// Stride (move) action is available
		this.canStride = true;

		// Step (5-foot step) action is available
		this.canStep = true;

		// Some characters can use the Sudden Charge ability
		this.canSuddenCharge = false;

		// Some characters might have special actions like Battle Medicine
		this.hasBattleMedicine = false;

		// Configure if the character can use the Raise a Shield action
		this.canRaiseShield = false;

		// Configure if the character can use the Take Cover action
		this.canTakeCover = true;

		// Configure if the character can use the Demoralize action
		this.canDemoralize = true;

		// Configure if the character can use the Feint action
		this.canFeint = false;

		// Configure if the character can use ranged attacks
		this.canUseRangedAttacks = true;

		// Configure if the character prefers to use ranged attacks when possible
		this.prefersRangedAttacks = false;
	}
}

// Initialize when mookAI is ready
Hooks.once("init", () => {
    debugLog("mookAI-PF2e | Initializing PF2e support for mookAI");

    // Ensure that this module only runs for the PF2e system.
    if (game.system.id !== "pf2e") {
        console.warn("mookAI-PF2e | PF2e system not detected. Current system:", game.system.id);
        return;
    }

    // Debug logging for mookAI module
    // console.log("mookAI-PF2e | Checking mookAI module status:");
    // console.log("- mookAI module object:", game.modules.get("mookAI-12"));
    // console.log("- mookAI module active:", game.modules.get("mookAI-12")?.active);
});

// Try registration at different hook points to ensure we catch when mookAI is ready
Hooks.once("setup", () => {
    debugLog("mookAI-PF2e | Setup hook fired");
    tryRegisterModel();
});

Hooks.once("ready", () => {
    debugLog("mookAI-PF2e | Ready hook fired");
    tryRegisterModel();
});

// Helper function to attempt registration
function tryRegisterModel() {
    const mookAI = game.modules.get("mookAI-12")?.api;

    // debugLog("- registerSystemModel exists:", typeof mookAI.registerSystemModel === "function");

    if (mookAI && typeof mookAI.registerSystemModel === "function") {
        try {
            mookAI.registerSystemModel("pf2e", MookModelPF2, MookModelSettingsPF2);
            console.log("mookAI-PF2e | Successfully registered PF2e Mook model with mookAI.");
        } catch (error) {
            console.error("mookAI-PF2e | Error registering PF2e model:", error);
        }
    } else {
        console.warn("mookAI-PF2e | mookAI registration function not found. Debug info:");
        debugLog("- mookAI full object:", game.modules.get("mookAI-12"));

        console.warn("PF2e model registration skipped.");
    }
}

