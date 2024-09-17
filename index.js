var prompt = require("prompt-sync")();
var fs = require("fs");
var yaml = require("js-yaml");
const { exit } = require("process");
const { Case } = require("change-case-all");
var { FluentBundle, FluentResource } = require("@fluent/bundle");
const debug = require('debug');
const { parse } = require("path");
debug.enable('simple-git,simple-git:*');


const resourcesFolder = "./space-station-14/Resources/";

var fullData = [];

var bundle = new FluentBundle("en-US");
loadFluentDir(resourcesFolder + "Locale/en-US/reagents/meta/");
loadFluentDir(resourcesFolder + "Locale/en-US/reagents/meta/consumable/food/");
loadFluentDir(resourcesFolder + "Locale/en-US/reagents/meta/consumable/drink/");

var reagentArray = []
var reactions = []

while (true) {
	let args = parseArgs(prompt("> ").split(" "));
	console.log(args)
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

function fullUpdate(args) {
	if(args.params.y) {
		reagentArray.push(readYAML(
			resourcesFolder + "Prototypes/Reagents/" + args.params.y + ".yml"
		))
		try {
			reactions.push(readYAML(
				resourcesFolder + "Prototypes/Recipes/Reactions/" + args.params.y + ".yml"
			))
		} catch (err) {
			console.error("Couldn't get reactions");
		}
	}
	reactions = reactions.flat()
	output = []
	
	for (let i = 0; i < reagentArray.length; i++) {
		output[i] = outputFromJSON(reagentArray[i], reactions)
	}
	output = output.flat()
	console.log(JSON.stringify(output, null, 3))
	return output
}

function outputFromJSON(reagents, reactions) {
	let output = [];
	console.log(reagents, reactions)
	for (let i = 0; i < reagents.length; i++) {
		const e = reagents[i];
		output[i] = {};
		output[i].id = e.id;
		output[i].group = e.group;
		output[i].color = e.color;
		output[i].flavor = e.flavor;
		output[i].metabolisms = e.metabolisms;
		let name = bundle.getMessage(e.name);
		output[i].name = bundle.formatPattern(name.value);
		let desc = bundle.getMessage(e.desc);
		output[i].desc = bundle.formatPattern(desc.value);
		let physicalDesc = bundle.getMessage(e.physicalDesc);
		output[i].physicalDesc = bundle.formatPattern(physicalDesc.value);
		output[i].recipes = [];
	}
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
	for (let i = 0; i < newReactions.length; i++) {
		let e = newReactions[i];
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
	let errors = 0;
	for (const e in output) {
		output[e].effects = [];
		let f = output[e].metabolisms;
		for (const g in f) {
			output[e].effects.push("'''" + g + "''':");
			let h = f[g].effects;
			for (let i = 0; i < h.length; i++) {
				let response = effectsHandler(h[i], output[e]);
				if (response == "") continue;
				output[e].effects.push("* " + response);
			}
		}
		let result = output[e].effects.flatMap((v, i, a) => {
			console.log(a);
			return a.length - 1 != i ? [v, "\n"] : v;
		});
		console.log(result);
		output[e].effects = result;

		output[e].effectLine = output[e].effects.join("")
	}
	fs.writeFileSync("./output.json", JSON.stringify(output, null, 4));
	return output;
}

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
	console.log(colors);
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

function effectsHandler(data, fullObject) {
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
					lNatFix(Math.abs(e[1]), 2) +
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
			fs += lNatFix(Math.abs(data.amount), 2) + "u of ";
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
				fs += "thirst at " + lNatFix(relative, 3) + "x the average rate";
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
			fs += lFormJ(Math.abs(data.amount)) + " of heat ";
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
			if (data.innoculate) fs += ", and provides immunity to future infections";
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
				fs += "hunger at " + lNatFix(hungerRate, 3) + "x the average rate";
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
		case "MakeSentient":
			fs = chanceString ? "make " : "Makes ";
			fs += "the metabolizer sentient";
			rs = fs;
			break;
		case "ResetNarcolepsy":
			fs = chanceString ? "temporarily stave " : "Temporarily staves ";
			fs += "off narcolepsy";
			rs = fs;
			break;
		case "ReduceRotting":
			fs = chanceString ? "reduce " : "Reduces ";
			fs += lNatFix(data.seconds, 3) + "s of rotting";
			rs = fs;
			break;
		default:
			throw new Error(JSON.stringify(data, null, 4));
			break;
	}
	let conditions = [];
	let cs = "";
	if (data.conditions) {
		for (const e of data.conditions) {
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
							cs = "there's at most " + lNatFix(e.max, 2) + "u of ";
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
							cs += "at most " + lNatFix(e.max, 2) + " total damage";
						}
					} else {
						cs += "at least " + lNatFix(e.min, 2) + " total damage";
					}
					conditions.push(cs);
					break;
				default:
					console.log("NO CONDITION for " + e.class + "\n");
					break;
			}
		}
	}
	if (rs === undefined) return undefined;
	if (rs === "") return "";
	if (conditions[0]) {
		rs += " when " + makeList(conditions);
	}
	return chanceString + rs;
}

function rName(reagent) {
	if (Case.lower(reagent) == "copperblood")
		return rName("HemocyaninBlood");
	if (Case.lower(reagent) == "soapreagent")
		return rName("soap");
	try {
		return bundle.getMessage("reagent-name-" + Case.kebab(reagent)).value;
	} catch (err) {
		console.warn("Warning:", Case.kebab(reagent), reagent, "does not exist");
	}
	try {
		return bundle.getMessage("reagent-name-" + Case.lower(reagent)).value;
	} catch (err) {
		console.warn(Case.lower(reagent), reagent, "does not exist");
	}
	throw new Error("Couldn't find " + reagent);
}


function lNatFix(num, pres) {
	pres = pres || 0;
	num = num * Math.pow(10, pres);
	num = Math.round(num);
	num = num / Math.pow(10, pres);
	return num.toString();
}

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
		bundle.addResource(new FluentResource(fs.readFileSync(dir + e, "utf8")));
		console.log("Loaded " + e);
	}
}

function parseArgs(args) {
	let parsedArgs = {
		custom: [],
		params: {}
	}

	for (let i = 0; i < args.length; i++) {
		if (args[i].substring(0, 1) != "-") parsedArgs.custom.push(args[i]);
		else {
			let option = args[i].substring(1)
			i++
			let value = args[i]
			parsedArgs.params[option] = value
		}
	}
	return parsedArgs
}