var prompt = require("prompt-sync")();
var fs = require("fs");
var yaml = require("js-yaml");
const { exit } = require("process");
const { Case } = require("change-case-all");
var { FluentBundle, FluentResource } = require("@fluent/bundle");

// ****************** CONFIGURING CONSTANTS ******************
const resourcesFolder = "./space-station-14/Resources/";
const commandArray = fs.readFileSync("./headless.ss").toString().split("\n")
// ***********************************************************

// loading fluent variables
var bundle = new FluentBundle("en-US");
loadFluentDir(resourcesFolder + "Locale/en-US/reagents/meta/");
loadFluentDir(resourcesFolder + "Locale/en-US/reagents/meta/consumable/food/");
loadFluentDir(resourcesFolder + "Locale/en-US/reagents/meta/consumable/drink/");
loadFluentDir(resourcesFolder + "Locale/en-US/guidebook/chemistry/");

var fullData = [];
var reagentArray = [];
var reactions = [];

// internal commandline let's go! TODO make this take arguments from the actual commandline + a config file
while (true) {
	let args = "";

	if (commandArray[0]) {
		console.log("\n\nRunning Headless...\n\n");
		args = commandArray.pop().split(" ");
	} else {
		args = prompt("> ").split(" ");
	}
	args = parseArgs(args);
	// console.log(args)
	switch (args.custom[0]) {
		case "g":
			fullData = fullUpdate(args);
			break;
		case "o":
			makeDiv(args);
			break;
		default:
			exit();
			break;
	}
}

// TODO add a way of reading ALL reagents and reactions
function fullUpdate(args) {
	if (args.params.y) {
		let filesToRead = args.params.y.split(",");
		for (let i = 0; i < filesToRead.length; i++) {
			const e = filesToRead[i];
			try{reagentArray.push(
				readYAML(resourcesFolder + "Prototypes/Reagents/" + e + ".yml")
			);} catch (err) {
				console.error("Couldn't find reagent file", e)
			}
			try {
				reactions.push(
					readYAML(
						resourcesFolder +
							"Prototypes/Recipes/Reactions/" +
							e +
							".yml"
					)
				);
			} catch (err) {
				console.error("Couldn't get reaction file", e);
			}
		}
	}
	reactions = reactions.flat();
	output = [];
	reactions = formatReactions(reactions);
	for (let i = 0; i < reagentArray.length; i++) {
		output[i] = outputFromYAML(reagentArray[i], reactions);
	}
	output = output.flat();

	fs.writeFileSync("./output.json", JSON.stringify(output, null, 4));
	return output;
}

// takes YAML (as a JSON object) and turns it into the output schema
function outputFromYAML(reagents, reactions) {
	let output = [];
	// console.log(reagents, reactions)
	for (let i = 0; i < reagents.length; i++) {
		const e = reagents[i];
		output[i] = {};
		output[i].id = e.id;
		output[i].group = e.group;
		if (!e.color) e.color = "#ffffff";
		output[i].color = e.color;

		let colors = e.color.substring(1).match(/../g);
		colors[0] = parseInt(colors[0], 16) * 0.299;
		colors[1] = parseInt(colors[1], 16) * 0.587;
		colors[2] = parseInt(colors[2], 16) * 0.114;
		if (colors[0] + colors[1] + colors[2] > 186) {
			colors = "dark";
		} else {
			colors = "light";
		}
		output[i].textColorTheme = colors;
		output[i].parent = e.parent;
		output[i].flavor = e.flavor;
		output[i].metabolisms = e.metabolisms;
		output[i].plantMetabolism = e.plantMetabolism;
		let name = bundle.getMessage(e.name);

		try{output[i].name = bundle.formatPattern(name.value);} catch (err) {console.warn("No name for " + e.id)}
		try{let desc = bundle.getMessage(e.desc);
		output[i].desc = bundle.formatPattern(desc.value);} catch (err) {console.warn("No desc for " + e.id)}
		try{let physicalDesc = bundle.getMessage(e.physicalDesc);
		output[i].physicalDesc = bundle.formatPattern(physicalDesc.value);} catch (err) {console.warn("No physicaldesc for " + e.id)}

		output[i].recipes = [];
	}

	for (let i = 0; i < reactions.length; i++) {
		let e = reactions[i];
		for (let j = 0; j < e.products.length; j++) {
			let f = e.products[j];
			let found = false;
			for (let k = 0; k < output.length && !found; k++) {
				const g = output[k];
				if (f[0] == g.name) {
					output[k].recipes.push(e);
					found = true;
				}
			}
		}
	}
	for (const e in output) {
		output[e].effects = {};
		if (output[e].parent) {
			for (let i = 0; i < output.length; i++) {
				let reag = output[i];
				if (reag.id == output[e].parent) {
					output[e].effects = reag.effects;
				}
			}
		}
		output[e].effects = joinEffects(
			output[e].effects,
			effectsFromMetabolisms(output[e].metabolisms, output[e], false)
		);
		if (output[e].plantMetabolism) {
			output[e].effects = joinEffects(
				output[e].effects,
				effectsFromMetabolisms(
					output[e].plantMetabolism,
					output[e],
					true
				)
			);
		}
	}
	for (const e in output) {
		output[e].effects = effectObjectFlatten(output[e].effects);
		output[e].effects = output[e].effects.flatMap((v, i, a) => {
			return (i < a.length - 1) ? [v, "\n"] : v;
		});
		output[e].effectLine = output[e].effects.join("");
	}
	return output;
}

function formatReactions(reactions) {
	let newReactions = [];
	for (let j = 0; j < reactions.length; j++) {
		let f = reactions[j];
		let newArray = [];
		for (const k in f.reactants) {
			newArray.push([
				rName(k),
				f.reactants[k].amount,
				!!f.reactants[k].catalyst,
			]);
		}
		f.reactants = newArray;
		newArray = [];
		for (const k in f.products) {
			newArray.push([rName(k), f.products[k]]);
		}
		f.products = newArray;
		newReactions.push(f);
	}
	return newReactions;
}

// This is mostly for testing
function makeDiv(args) {
	let data = {};
	fullData.forEach((e) => {
		if (e.id == args.custom[1]) {
			data = e;
		}
	});
	let colors = data.color.substring(1).match(/../g);
	colors[0] = parseInt(colors[0], 16) * 0.299;
	colors[1] = parseInt(colors[1], 16) * 0.587;
	colors[2] = parseInt(colors[2], 16) * 0.114;
	if (colors[0] + colors[1] + colors[2] > 186) {
		colors = "#000000";
	} else {
		colors = "#ffffff";
	}
	// console.log(colors);
	recipeOutput = "";
	for (let i = 0; i < data.recipes.length; i++) {
		recipeOutput += "{{Recipe Box|name=" + Case.title(data.name);
		for (let j = 0; j < data.recipes[i].reactants.length; j++) {
			recipeOutput +=
				"|component-" +
				j +
				"={{Recipe Component|item=" +
				Case.title(data.recipes[i].reactants[j][0]) +
				"|amount=" +
				data.recipes[i].reactants[j][1] +
				"}}";
		}
		recipeOutput += "|transformer= {{Beaker";
		recipeOutput += data.recipes[i].minTemp
			? "|temperature=" + data.recipes[i].minTemp + "k}}"
			: "}}";
		for (let j = 0; j < data.recipes[i].products.length; j++) {
			recipeOutput +=
				"|result={{Recipe Component|item=" +
				Case.title(data.recipes[i].products[j][0]) +
				"|amount=" +
				data.recipes[i].products[j][1] +
				"}}";
		}
	}
	recipeOutput += recipeOutput ? "}}" : "";

	console.log(data);
	console.log(
		"{{Manual Chem Box|id=%s|color=%s|textcolor=%s|name=%s|recipes=%s|metabolisms=%s|desc=%s|physicalDesc=%s}}",
		data.id,
		data.color,
		colors,
		Case.title(data.name),
		recipeOutput,
		data.effects.join(""),
		data.desc,
		data.physicalDesc
	);
}

function effectObjectFlatten(effects) {
	let newEffects = [];
	for (const g in effects) {
		console.log(g)
		newEffects.push("'''" + g + "''' (" + effects[g].metabolismRate + "u per second)");
		for (let i = 0; i < effects[g].effects.length; i++) {
			newEffects.push(effects[g].effects[i]);
		}
	}
	return newEffects;
}

function effectsFromMetabolisms(metabolismList, fullObject, isPlant) {
	if (metabolismList === undefined) return {};
	let effects = {};
	if (!isPlant) {
		for (const g in metabolismList) {
			// output[e].effects.push("'''" + g + "''':");
			effects[g] = {}
			effects[g].effects = [];
			effects[g].metabolismRate = metabolismList[g].metabolismRate || 0.5
			let h = metabolismList[g].effects;
			for (let i = 0; i < h.length; i++) {
				let response = effectsHandler(h[i], fullObject, isPlant);
				if (response == "") continue;
				effects[g].effects.push("* " + response);
			}
		}
	} else {
		effects["Plants"] = [];
		for (let i = 0; i < metabolismList.length; i++) {
			let response = effectsHandler(
				metabolismList[i],
				fullObject,
				isPlant
			);
			if (response == "") continue;
			effects["Plants"].push("* " + response);
		}
	}
	return effects;
}

function joinEffects(x, y) {
	let z = {};

	if (x !== undefined) {
		for (const e in x) {
			if (z[e] === undefined) z[e] = {effects: []};
			z[e].effects.push(x[e].effects);
			z[e].metabolismRate = x[e].metabolismRate || 0.5
			z[e].effects = z[e].effects.flat();
		}
	}
	if (y !== undefined) {
		for (const e in y) {
			if (z[e] === undefined) z[e] = {effects: []};
			z[e].effects.push(y[e].effects);
			z[e].metabolismRate = y[e].metabolismRate || 0.5
			z[e].effects = z[e].effects.flat();
		}
	}
	return z;
}

// used by outputFromYAML, is a ton of spaghetti code (looking at you massive switch statement)
function effectsHandler(data, fullObject, isPlant) {
	let statusEffects = {
		Stun: "stunning",
		KnockedDown: "knockdown",
		Jitter: "jittering",
		TemporaryBlindness: "blindess",
		SeeingRainbows: "hallucinations",
		Muted: "inability to speak",
		Stutter: "stuttering",
		ForcedSleep: "unconsciousness",
		Drunk: "drunkness",
		PressureImmunity: "pressure immunity",
		Pacified: "combat pacification",
		RatvarianLanguage: "ratvarian language patterns",
		StaminaModifier: "modified stamina",
		RadiationProtection: "radiation protection",
		Drowsiness: "drowsiness",
		Adrenaline: "adrenaline",
	};

	let chanceString =
		data.probability == 1 || !data.probability
			? ""
			: "Has a " + Math.floor(data.probability * 100) + "% chance to ";
	let fs = "";
	let initialVerb = "";
	let sign = true;
	let rs = undefined;
	if (!isPlant) {
		switch (data.class) {
			case "GenericStatusEffect":
				initialVerb =
					data.type == "Remove"
						? chanceString
							? "remove "
							: "Removes "
						: chanceString
						? "cause "
						: "Causes ";
				let effect = statusEffects[data.key];
				data.time = data.time || 2;
				fs =
					initialVerb +
					(data.type == "Remove"
						? lNatFix(data.time, 2) + "s of " + effect
						: effect +
						  " for at least " +
						  lNatFix(data.time, 2) / 10 +
						  "s " +
						  (data.type == "Add"
								? "with accumulation"
								: "without accumulation"));
				rs = fs;
				break;
			case "Drunk":
				rs = (chanceString ? "cause " : "Causes ") + "drunkness";
				break;
			case "HealthChange":
				let damages = [];
				let heals = false;
				let deals = false;
				for (const key in data.damage.groups) {
					value = data.damage.groups[key];

					damages.push([key, value]);
				}
				for (const key in data.damage.types) {
					value = data.damage.types[key];

					damages.push([key, value]);
				}
				for (let i = 0; i < damages.length; i++) {
					const e = damages[i];
					if (e[1] > 0) {
						deals = true;
					} else if (e[1] < 0) {
						heals = true;
					}
					damages[i] =
						(e[1] > 0
							? '<span style="color:red">'
							: '<span style="color:green">') +
						lNatFix(e[1], 2) +
						"</span> " +
						e[0];
				}
				let healsordeals = heals
					? deals
						? "both"
						: "heals"
					: deals
					? "deals"
					: "";
				damages = makeList(damages);
				initialVerb = "";
				switch (healsordeals) {
					case "heals":
						initialVerb = chanceString ? "heal " : "Heals ";
						break;
					case "deals":
						initialVerb = chanceString ? "deal " : "Deals ";
						break;
					default:
						initialVerb = chanceString
							? "modify health by "
							: "Modifies health by ";
						break;
				}
				rs = initialVerb + damages;
				break;
			case "Jitter":
				rs = (chanceString ? "cause " : "Causes ") + "jittering";
				break;
			case "PopupMessage":
				rs = "";
				break;
			case "ChemVomit":
				rs = (chanceString ? "cause " : "Causes ") + "vomiting";
				break;
			case "AdjustReagent":
				sign = data.amount >= 0; // true is positive
				fs = chanceString
					? sign
						? "add "
						: "remove "
					: sign
					? "Adds "
					: "Removes ";
				fs += lNatFix(data.amount, 2) + "u of ";
				if (data.reagent) {
					data.reagent = rName(data.reagent);
					fs += data.reagent;
				} else {
					fs += "reagents in the group " + data.group;
				}
				fs += (sign ? " to" : " from") + " the solution";
				rs = fs;
				break;
			case "ModifyBleedAmount":
				sign = data.amount >= 0;
				rs = chanceString
					? sign
						? "induce bleeding"
						: "reduce bleeding"
					: sign
					? "Induces bleeding"
					: "Reduces bleeding";
				break;
			case "SatiateThirst":
				data.factor = data.factor || 3;
				fs = chanceString ? "satiate " : "Satiates ";
				let relative = data.factor / 3;
				if (relative == 1) {
					fs += "thirst averagely";
				} else {
					fs +=
						"thirst at " +
						lNatFix(relative, 3) +
						"x the average rate";
				}
				rs = fs;
				break;
			case "AdjustTemperature":
				sign = data.amount >= 0;
				fs = chanceString
					? sign
						? "add "
						: "remove "
					: sign
					? "Adds "
					: "Removes ";
				fs += lFormJ(data.amount) + " of heat ";
				fs += sign ? "to " : "from ";
				fs += "the body it's in";
				rs = fs;
				break;
			case "Emote":
				rs = "";
				break;
			case "CureZombieInfection":
				fs = chanceString ? "cure " : "Cures ";
				fs += "an ongoing zombie infection";
				if (data.innoculate)
					fs += ", and provides immunity to future infections";
				rs = fs;
				break;
			case "ModifyBloodLevel":
				sign = data.amount >= 0;
				fs = chanceString
					? sign
						? "increase "
						: "decrease "
					: sign
					? "Increases "
					: "Decreases ";
				fs += "blood level";
				rs = fs;
				break;
			case "SatiateHunger":
				data.factor = data.factor || 3;
				fs = chanceString ? "satiate " : "Satiates ";
				let hungerRate = data.factor / 3;
				if (hungerRate == 1) {
					fs += "hunger averagely";
				} else {
					fs +=
						"hunger at " +
						lNatFix(hungerRate, 3) +
						"x the average rate";
				}
				rs = fs;
				break;
			case "ChemHealEyeDamage":
				data.amount = data.amount || -1;
				sign = data.amount >= 0;
				fs = chanceString
					? sign
						? "deal "
						: "heal "
					: sign
					? "Deals "
					: "Heals ";
				fs += "eye damage";
				rs = fs;
				break;
			case "ChemCleanBloodstream":
				data.cleanseRate = data.cleanseRate || 3;
				fs = chanceString ? "cleanse " : "Cleanses ";
				fs += "the bloodstream of other chemicals";
				rs = fs;
				break;
			case "MakeSentient":
				fs = chanceString ? "make " : "Makes ";
				fs += "the metabolizer sentient";
				rs = fs;
				break;
			case "ResetNarcolepsy":
				fs = chanceString
					? "temporarily stave "
					: "Temporarily staves ";
				fs += "off narcolepsy";
				rs = fs;
				break;
			case "ReduceRotting":
				fs = chanceString ? "reduce " : "Reduces ";
				fs += lNatFix(data.seconds, 3) + "s of rotting";
				rs = fs;
				break;
			case "Polymorph":
				fs = chanceString ? "polymorph " : "Polymorphs";
				fs += "the metabolizer into a ";
				switch (data.prototype) {
					case "TreeMorph":
						fs += "tree";
						break;
					default:
						fs = undefined;
						break;
				}
				rs = fs;
				break;
			case "Oxygenate":
				rs = "";
				break;
			case "ModifyLungGas":
				rs = "";
				break;
			case "AdjustAlert":
				rs = "";
				break;
			case "Electrocute":
				data.electrocuteTime = data.electrocuteTime || 2;
				fs = chanceString ? "electrocute " : "Electrocutes ";
				fs +=
					"the metabolizer for " +
					data.electrocuteTime +
					" second" +
					(data.electrocuteTime != 1 ? "s" : "");
				rs = fs;
				break;
			case "MovespeedModifier":
				data.walkSpeedModifier = data.walkSpeedModifier || 1;
				data.statusLifetime = data.statusLifetime || 2;
				fs = chanceString ? "modify " : "Modifies ";
				fs += "movement speed by " + lNatFix(data.walkSpeedModifier, 3);
				fs +=
					"x for at least " +
					lNatFix(data.statusLifetime, 3) +
					" second";
				fs += data.statusLifetime != 1 ? "s" : "";
				rs = fs;
				break;
			case "FlammableReaction":
				fs = chanceString ? "increase " : "Increases ";
				fs += "flammability";
				rs = fs;
				break;
			case "Ignite":
				fs = chanceString ? "ignite " : "Ignites ";
				fs += "the metabolizer";
				rs = fs;
				break;
			case "CauseZombieInfection":
				fs = chanceString ? "give " : "Gives ";
				fs += "the individual the zombie infection";
				break;
			default:
				throw new Error(JSON.stringify(data, null, 4));
		}
	} else {
		function lPlantAdjust(key, positive) {
			let returnValue = chanceString ? "adjust " : "Adjusts ";
			data.amount = data.amount || 1;
			let sign = !positive == !(data.amount >= 0);
			returnValue += bundle.getMessage(key).value + " by ";
			returnValue += sign
				? '<span style="color:green">'
				: '<span style="color:red">';
			returnValue += data.amount + "</span>";
			return returnValue;
		}
		switch (data.class) {
			case "PlantAdjustNutrition":
				rs = lPlantAdjust("plant-attribute-nutrition", true);
				break;
			case "PlantAdjustHealth":
				rs = lPlantAdjust("plant-attribute-health", true);
				break;
			case "PlantAdjustMutationMod":
				rs = lPlantAdjust("plant-attribute-mutation-mod", true);
				break;
			case "PlantAdjustMutationLevel":
				rs = lPlantAdjust("plant-attribute-mutation-level", true);
			case "PlantAdjustToxins":
				rs = lPlantAdjust("plant-attribute-toxins", false);
				break;
			case "PlantAdjustPests":
				rs = lPlantAdjust("plant-attribute-pests", false);
				break;
			case "PlantAdjustWeeds":
				rs = lPlantAdjust("plant-attribute-weeds", false);
				break;
			case "RobustHarvest {}":
				// potencyLimit and the other variables are not the actual names, as they aren't actually implemented and I just guessed. Should probably fix if it ever comes into play
				data.potencyLimit = data.potencyLimit || 50;
				data.potencyIncrease = data.potencyIncrease || 3;
				data.potencySeedlessThreshold =
					data.potencySeedlessThreshold || 30;
				fs = chanceString ? "increase " : "Increases ";
				fs +=
					"the plant's potency by " +
					data.potencyIncrease +
					" up to a maximum of " +
					data.potencyLimit +
					". Causes the plant to lose its seeds once the potency reaches " +
					data.potencySeedlessThreshold +
					". Trying to add potency over " +
					data.potencyLimit +
					" may cause a decrease in yield at a 10% chance";
				rs = fs;
				break;
			case "PlantRestoreSeeds":
				rs =
					(chanceString ? "restore " : "Restores ") +
					"the seeds of the plant";
				break;
			case "PlantAdjustPotency":
				rs = lPlantAdjust("plant-attribute-potency", true);
				break;
			case "PlantAffectGrowth":
				rs = lPlantAdjust("plant-attribute-growth", true);
				break;
			case "PlantAdjustWater":
				rs = lPlantAdjust("plant-attribute-water", true);
				break;
			case "PlantDiethylamine {}":
				rs =
					(chanceString ? "increase " : "Increases ") +
					"the plant's lifespan and/or base health with 10% chance for each";
				break;
			case "PlantPhalanximine":
				rs =
					(chanceString ? "restore " : "Restores ") +
					"viability to a plant rendered nonviable by a mutation";
				break;
			case "PlantCryoxadone {}":
				rs =
					(chanceString ? "age " : "Ages ") +
					"back the plant, depending on the plant's age and time to grow";
				break;
			default:
				throw new Error(JSON.stringify(data, null, 4));
				break;
		}
		console.log(rs);
	}

	if (rs === undefined) return undefined;
	if (rs === "") return "";
	let conditions = [];
	let cs = "";
	if (data.conditions) {
		for (const e of data.conditions) {
			cs = "";
			switch (e.class) {
				case "ReagentThreshold":
					e.min = e.min || 0;
					e.max = e.max || Infinity;
					if (e.max !== Infinity) {
						if (e.min > 0) {
							cs =
								"there's between " +
								lNatFix(e.min, 2) +
								"u and " +
								lNatFix(e.max, 2) +
								"u of ";
						} else {
							cs =
								"there's at most " +
								lNatFix(e.max, 2) +
								"u of ";
						}
					} else {
						cs = "there's at least " + lNatFix(e.min, 2) + "u of ";
					}
					if (e.reagent) {
						cs += rName(e.reagent);
					} else {
						cs += rName(fullObject.id);
					}
					conditions.push(cs);
					break;
				case "Temperature":
					e.min = e.min || 0;
					e.max = e.max || Infinity;
					cs = "the body's temperature is ";
					if (e.max !== Infinity) {
						if (e.min > 0) {
							cs +=
								"between " +
								lNatFix(e.min, 2) +
								"k and " +
								lNatFix(e.max, 2) +
								"k";
						} else {
							cs += "at most " + lNatFix(e.max, 2) + "k";
						}
					} else {
						cs += "at least " + lNatFix(e.min, 2) + "k";
					}
					conditions.push(cs);
					break;
				case "MobStateCondition":
					conditions.push("the mob is " + Case.lower(e.mobstate));
					break;
				case "TotalDamage":
					e.min = e.min || 0;
					e.max = e.max || Infinity;
					cs = "it has ";
					if (e.max !== Infinity) {
						if (e.min > 0) {
							cs +=
								"between " +
								lNatFix(e.min, 2) +
								" and " +
								lNatFix(e.max, 2) +
								" total damage";
						} else {
							cs +=
								"at most " +
								lNatFix(e.max, 2) +
								" total damage";
						}
					} else {
						cs += "at least " + lNatFix(e.min, 2) + " total damage";
					}
					conditions.push(cs);
					break;
				case "Hunger":
					e.min = e.min || 0;
					e.max = e.max || Infinity;
					cs = "the target has ";
					if (e.max !== Infinity) {
						if (e.min > 0) {
							cs +=
								"between " +
								lNatFix(e.min, 2) +
								" and " +
								lNatFix(e.max, 2) +
								" total hunger";
						} else {
							cs +=
								"at most " +
								lNatFix(e.max, 2) +
								" total hunger";
						}
					} else {
						cs += "at least " + lNatFix(e.min, 2) + " total hunger";
					}
					conditions.push(cs)
					break;
				case "OrganType":
					if (e.shouldHave === undefined) e.shouldHave = true;
					cs = "the metabolizing organ ";
					cs += e.shouldHave ? "is " : "is not ";
					cs += lIndef(e.type) + " " + e.type + " organ";
					conditions.push(cs);
					break;
				case "HasTag":
					if (e.invert === undefined) e.invert = false;
					cs = "the target ";
					cs += e.invert ? "does not have " : "has ";
					cs += "the tag " + e.tag;
					conditions.push(cs);
					break;
				default:
					console.warn("NO CONDITION for " + e.class + "\n");
					console.log(e);
					break;
			}
		}
	}
	if (conditions[0]) {
		rs += " when " + makeList(conditions);
	}
	return chanceString + rs;
}

// gets the "real name" of a reagent. Usually this is just reagent-name-[ID in lowercase] but sometimes it is different so just putting the exceptions in manually
function rName(reagent) {
	if (Case.lower(reagent) == "copperblood") return rName("HemocyaninBlood");
	if (Case.lower(reagent) == "soapreagent") return rName("Soap");
	if (Case.lower(reagent) == "eznutrient") {
		return rName("e-z-nutrient");
	}
	if (Case.lower(reagent) == "juicethatmakesyouweh") return rName("weh");
	if (Case.lower(reagent) == "eggcooked") return rName("egg");
	try {
		return bundle.getMessage("reagent-name-" + Case.kebab(reagent)).value;
	} catch (err) {
		console.warn(
			"Warning:",
			Case.kebab(reagent),
			reagent,
			"does not exist"
		);
	}
	try {
		return bundle.getMessage("reagent-name-" + Case.lower(reagent)).value;
	} catch (err) {
		console.warn(Case.lower(reagent), reagent, "does not exist");
	}
	throw new Error("Couldn't find " + reagent);
}

function lNatFix(num, pres) {
	num = Math.abs(num);
	pres = pres || 0;
	num = num * Math.pow(10, pres);
	num = Math.round(num);
	num = num / Math.pow(10, pres);
	return num.toString();
}

// I mean it works, could be abstracted if we ever need to do kPa or something
function lFormJ(joules) {
	let j = lFormGen(joules);
	switch (j[1]) {
		case 0:
			return j[0] + "J";
			break;
		case 1:
			return j[0] + "kJ";
			break;
		case 2:
			return j[0] + "MJ";
			break;
		case 3:
			return j[0] + "GJ";
			break;
		case 4:
			return j[0] + "TJ";
			break;
		default:
			return "???";
			break;
	}
}
function lFormGen(unit) {
	const maxPlaces = 5;
	let places = 0;
	while (unit > 1000 && places < maxPlaces) {
		unit = unit / 1000;
		places += 1;
	}
	return [unit, places];
}

function lIndef(word) {
	return ["a", "e", "i", "o", "u"].includes(word.substring(0, 1))
		? "an"
		: "a";
}

// stolen from the game's localisation manager
function makeList(array) {
	switch (array.length) {
		case 0:
			return "";
			break;
		case 1:
			return array[0];
			break;
		case 2:
			return array[0] + " and " + array[1];
			break;
		default:
			let string = "";
			for (let i = 0; i < array.length; i++) {
				const e = array[i];
				if (i < array.length - 1) string += e + ", ";
				else {
					string += "and " + e;
				}
			}
			return string;
			break;
	}
}

// because of course the YAML has something that the parser can't handle
function readYAML(filePath) {
	return yaml.load(
		fs.readFileSync(filePath, "utf8").replace(/!type:/g, "class: ")
	);
}
function loadFluentDir(dir) {
	const fileNames = fs.readdirSync(dir);
	console.log(fileNames);
	// Chem names and descriptions
	for (const e of fileNames) {
		if (!e.match(/\.ftl/g)) continue;
		bundle.addResource(
			new FluentResource(fs.readFileSync(dir + e, "utf8"))
		);
		console.log("Loaded " + e);
	}
}

function parseArgs(args) {
	let parsedArgs = {
		custom: [],
		params: {},
	};

	for (let i = 0; i < args.length; i++) {
		if (args[i].substring(0, 1) != "-") parsedArgs.custom.push(args[i]);
		else {
			let option = args[i].substring(1);
			i++;
			let value = args[i];
			parsedArgs.params[option] = value;
		}
	}
	return parsedArgs;
}
