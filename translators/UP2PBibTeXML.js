{
	"translatorID":"2539A338-98F5-11E0-9A51-59F44824019B",
	"translatorType":3,
	"label":"U-P2P BibTeXML",
	"creator":"Alexander Craig, Simon Kornblith and Richard Karnesky",
	"target":"xml",
	"minVersion":"3.0",
	"maxVersion":"",
	"priority":100,
	"configOptions":{"dataMode":"xml/e4x"},
	"displayOptions":{"exportCharset":"UTF-8", "exportFileData":false},
	"inRepository":false,
	"lastUpdated":"2011-07-04 14:40:00"
}

var bibtexmlFieldOrder = {
	article: 
		["author", "title", "journal", "year", "volume", "number", "pages",
			"month", "note"],
	book:
		["author", "editor", "title", "publisher", "year", "volume", "number",
			"series", "address", "edition", "month", "note"],
	booklet:
		["author", "title", "howpublished", "address", "month", "year", "note"],
	manual:
		["author", "title", "organization", "address", "edition", "month", "year",
			"note"],
	techreport:
		["author", "title", "institution", "year", "type", "number", "address", "month",
			"note"],
	mastersthesis:
		["author", "title", "school", "year", "type", "address", "month", "note"],
	phdthesis:
		["author", "title", "school", "year", "type", "address", "month", "note"],
	inbook:
		["author", "editor", "title", "chapter", "pages", "publisher", "year",
			"volume", "number", "series", "type", "address", "edition", "month",
			"note"],
	incollection:
		["author", "title", "booktitle", "publisher", "year", "editor", "volume",
			"number", "series", "type", "chapter", "pages", "address", "edition",
			"month", "note"],
	proceedings:
		["editor", "title", "year", "volume", "number", "series", "address", "month",
			"organization", "publisher", "note"],
	inproceedings:
		["author", "title", "booktitle", "year", "editor", "volume", "number",
			"series", "pages", "address", "month", "organization", "publisher",
			"note"],
	conference:
		["author", "title", "booktitle", "year", "editor", "volume", "number",
			"series", "pages", "address", "month", "organization", "publisher",
			"note"],
	unpublished:
		["author", "title", "note", "month", "year"],
	misc:
		["author", "title", "howpublished", "month", "year", "note"]
};

//%a = first author surname
//%y = year
//%t = first word of title
var citeKeyFormat = "%a_%t_%y";

var fieldMap = {
	address:"place",
	chapter:"chapter",
	edition:"edition",
	type:"type",
	series:"series",
	title:"title",
	volume:"volume",
	copyright:"rights",
	isbn:"ISBN",
	issn:"ISSN",
	lccn:"callNumber",
	location:"archiveLocation",
	shorttitle:"shortTitle",
	url:"url",
	doi:"DOI",
	"abstract":"abstractNote"
};

var inputFieldMap = {
	booktitle :"publicationTitle",
	school:"publisher",
	institution:"publisher",
	publisher:"publisher",
	issue:"issue"
};

var zotero2bibtexTypeMap = {
	"book":"book",
	"bookSection":"incollection",
	"journalArticle":"article",
	"magazineArticle":"article",
	"newspaperArticle":"article",
	"thesis":"phdthesis",
	"letter":"misc",
	"manuscript":"unpublished",
	"interview":"misc",
	"film":"misc",
	"artwork":"misc",
	"webpage":"misc",
	"conferencePaper":"inproceedings",
	"report":"techreport"
};

var bibtex2zoteroTypeMap = {
	"book":"book", // or booklet, proceedings
	"inbook":"bookSection",
	"incollection":"bookSection",
	"article":"journalArticle", // or magazineArticle or newspaperArticle
	"phdthesis":"thesis",
	"unpublished":"manuscript",
	"inproceedings":"conferencePaper", // check for conference also
	"conference":"conferencePaper",
	"techreport":"report",
	"booklet":"book",
	"manual":"book",
	"mastersthesis":"thesis",
	"misc":"book",
	"proceedings":"book"
};

var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "SSep", "Oct", "Nov", "Dec"];

// ---------------- Import Translator Implementation  ---------------- 

function detectImport() {
	// For now, check that all first level children of the processed XML
	// have the tag name "entry" (could also check that second level children are valid
	// BibTeXML types, but root tag can be anything)
	var xml = Zotero.getXML();
	var name = xml.name();
	if (!name) {
		Zotero.debug("No root name.");
		return false;
	}
	
	var childList = xml.*;
	if(childList.length() == 0) {
		Zotero.debug("Got empty child list.");
		return false;
	}
	
	for each (var child in childList) {
		if(child.name() != "entry") {
			Zotero.debug("Got unexpected child name: " + child.name());
			return false;
		}
	}

	Zotero.debug("detectImport returning true");
	return true;
}

/**
 * Replaces any XML escape sequences in the passed string with their
 * respective characters, and returns the result.
 */
function xmlDecode(text) {
	var newText = text.replace(/\&quot;/g, '"');
	newText = newText.replace(/\&apos;/g, "'");
	newText = newText.replace(/\&lt;/g, "<");
	newText = newText.replace(/&gt;/g, ">");
	newText = newText.replace(/\&amp;/g, "&");
	return newText;
}

function doImport() {
	var xml = Zotero.getXML();
	var childList = xml.*;
	
	var i = 0;
	for each (var entryRoot in childList) {
		var newItem = new Zotero.Item();
		
		// Get the title of the item
		newItem.title = xmlDecode(entryRoot.*.title);
		Zotero.debug("NewItem.title = " + newItem.title);
		
		// Get the item type of the item
		// TODO: Don't commit this item if a valid type could not be found
		var itemType;
		var bibtexmlItemType;
		for each(var entryType in entryRoot.*) {
			if(entryType.name() == "file") {
				// Attachment field for the entry, ignore for now
				continue;
			} else {
				bibtexmlItemType = entryType.name();
			}
		}
		newItem.itemType = bibtex2zoteroTypeMap[bibtexmlItemType];
		Zotero.debug("NewItem.itemType = " + newItem.itemType);
		
		// Get the author / editors of the piece
		for each(var author in entryRoot.*.author) {
			var creator = buildCreatorObj(xmlDecode(author), "author");
			newItem.creators.push(creator);
		}
		for each(var editor in entryRoot.*.editor) {
			var creator = buildCreatorObj(xmlDecode(editor), "editor");
			newItem.creators.push(creator);
		}
		
		// If a journal or booktitle is specified, store it as the publicationTitle
		for each(var pubTitle in entryRoot.*.booktitle) {
			newItem.publicationTitle = xmlDecode(pubTitle);
			Zotero.debug("NewItem.publicationTitle (booktitle) = " + newItem.publicationTitle);
		}
		for each(var pubTitle in entryRoot.*.journal) {
			newItem.publicationTitle = xmlDecode(pubTitle);
			Zotero.debug("NewItem.publicationTitle (journal) = " + newItem.publicationTitle);
		}
		
		// Get the publisher
		for each(var publisher in entryRoot.*.publisher) {
			newItem.publisher = xmlDecode(publisher);
		}
		for each(var publisher in entryRoot.*.institution) {
			newItem.publisher = xmlDecode(publisher);
		}
		for each(var publisher in entryRoot.*.school) {
			newItem.publisher = xmlDecode(publisher);
		}
		
		// Get the publication date
		var dateString = "";
		for each(var month in entryRoot.*.month) {
			dateString += month + ", ";
		}
		for each(var year in entryRoot.*.year) {
			dateString += year;
		}
		if(dateString != "") {
			newItem.date = dateString;
		}
		
		// Read the "number" field based on the type of element
		for each(var number in entryRoot.*.number) {
			if(bibtexmlItemType == "techreport") {
				newItem.reportNumber = number;
			} else if (bibtexmlItemType == "article") {
				newItem.issue = number;
			} else {
				newItem.seriesNumber = number;
			}
		}
		
		// Read the volume field
		for each(var volume in entryRoot.*.volume) {
			newItem.volume = volume;
		}
		
		// Read the pages field
		for each(var pages in entryRoot.*.volume) {
			newItem.pages = pages;
		}
		
		// Read the type field
		for each(var type in entryRoot.*.type) {
			newItem.pages = type;
		}
		
		// Read the series field
		for each(var series in entryRoot.*.series) {
			newItem.series = series;
		}
		
		// Read the chapter field
		for each(var chapter in entryRoot.*.chapter) {
			newItem.chapter = chapter;
		}
		
		// Read the edition field
		for each(var edition in entryRoot.*.edition) {
			newItem.edition = edition;
		}
		
		// Get the howpublished field (this should only ever contain URL's if exported
		// from Zotero)
		for each(var url in entryRoot.*.howpublished) {
			newItem.url = url;
		}
		
		newItem.complete();
		Zotero.setProgress(i++ / childList.length() * 100);
	}
}

/**
 * Converts a BibTeXML creator string into a creator object for use with a Zotero item.
 */
function buildCreatorObj(creatorString, creatorType) {
	var creator = {};
	
	// BibTeXML doesn't store first and last name of authors separately...
	// For now, assume that the first comma in the name is the separator
	var firstComma = creatorString.indexOf(",");
	if(firstComma == -1) {
		// No first/last name separator detected, use the whole string as the last name
		creator.firstName = "";
		creator.lastName = creatorString;
	} else {
		creator.firstName = creatorString.substring(firstComma + 1);
		creator.lastName = creatorString.substring(0, firstComma);
	}
	
	creator.creatorType = creatorType;
	return creator;
}

// ---------------- Export Translator Implementation  ---------------- 

/**
 * Replaces any XML restricted characters in the passed string with their
 * XML escape sequences, and returns the result.
 */
function xmlEscape(text) {
	var newText = text.replace(/\&/g, "&amp;");
	newText = newText.replace(/\"/g, "&quot;");
	newText = newText.replace(/\'/g, "&apos;");
	newText = newText.replace(/</g, "&lt;");
	newText = newText.replace(/>/g, "&gt;");
	return newText;
}

function storeField(field, value, fieldMap, mapKeys) {
	if(!value && typeof value != "number") return;
	value = value + ""; // Convert integers to strings
	value = xmlEscape(value); // Replace XML characters with escape sequences

	if (Zotero.getOption("exportCharset") != "UTF-8") {
		value = value.replace(/[\u0080-\uFFFF]/g, mapAccent);
	}
	
	if(fieldMap[field] == undefined) {
		fieldMap[field] = [value];
		mapKeys.push(field);
	} else {
		fieldMap[field].push(value);
	}
}

function mapAccent(character) {
	return (mappingTable[character] ? mappingTable[character] : "?");
}

// a little substitution function for BibTeX keys, where we don't want LaTeX 
// escaping, but we do want to preserve the base characters

function tidyAccents(s) {
	var r = s.toLowerCase();
	r = r.replace(new RegExp("[ä]", 'g'),"ae");
	r = r.replace(new RegExp("[ö]", 'g'),"oe");
	r = r.replace(new RegExp("[ü]", 'g'),"ue");
	r = r.replace(new RegExp("[àáâãå]", 'g'),"a");
	r = r.replace(new RegExp("æ", 'g'),"ae");
	r = r.replace(new RegExp("ç", 'g'),"c");
	r = r.replace(new RegExp("[èéêë]", 'g'),"e");
	r = r.replace(new RegExp("[ìíîï]", 'g'),"i");
	r = r.replace(new RegExp("ñ", 'g'),"n");                            
	r = r.replace(new RegExp("[òóôõ]", 'g'),"o");
	r = r.replace(new RegExp("œ", 'g'),"oe");
	r = r.replace(new RegExp("[ùúû]", 'g'),"u");
	r = r.replace(new RegExp("[ýÿ]", 'g'),"y");
	return r;
};

var numberRe = /^[0-9]+/;
// Below is a list of words that should not appear as part of the citation key
// in includes the indefinite articles of English, German, French and Spanish, as well as a small set of English prepositions whose 
// force is more grammatical than lexical, i.e. which are likely to strike many as 'insignificant'.
// The assumption is that most who want a title word in their key would prefer the first word of significance.
var citeKeyTitleBannedRe = /\b(a|an|the|some|from|on|in|to|of|do|with|der|die|das|ein|eine|einer|eines|einem|einen|un|une|la|le|l\'|el|las|los|al|uno|una|unos|unas|de|des|del|d\')(\s+|\b)/g;
var citeKeyConversionsRe = /%([a-zA-Z])/;
var citeKeyCleanRe = /[^a-z0-9\*\+\-\.\[\]\_]+/g;

var citeKeyConversions = {
    "a":function (flags, item) {
        if(item.creators && item.creators[0] && item.creators[0].lastName) {
            return item.creators[0].lastName.toLowerCase().replace(/ /g,"_").replace(/,/g,"");
        }
        return "";
    },
    "t":function (flags, item) {
        if (item["title"]) {
            return item["title"].toLowerCase().replace(citeKeyTitleBannedRe, "").split(/\s+/g)[0];
        }
        return "";
    },
    "y":function (flags, item) {
        if(item.date) {
            var date = Zotero.Utilities.strToDate(item.date);
            if(date.year && numberRe.test(date.year)) {
                return date.year;
            }
        }
        return "????";
    }
}


function buildCiteKey (item,citekeys) {
    var basekey = "";
    var counter = 0;
    citeKeyFormatRemaining = citeKeyFormat;
    while (citeKeyConversionsRe.test(citeKeyFormatRemaining)) {
        if (counter > 100) {
            Zotero.debug("Pathological BibTeX format: " + citeKeyFormat);
            break;
        }
        var m = citeKeyFormatRemaining.match(citeKeyConversionsRe);
        if (m.index > 0) {
            //add data before the conversion match to basekey
            basekey = basekey + citeKeyFormatRemaining.substr(0, m.index);
        }
        var flags = ""; // for now
        var f = citeKeyConversions[m[1]];
        if (typeof(f) == "function") {
            var value = f(flags, item);
            Zotero.debug("Got value " + value + " for %" + m[1]);
            //add conversion to basekey
            basekey = basekey + value;
        }
        citeKeyFormatRemaining = citeKeyFormatRemaining.substr(m.index + m.length);
        counter++;
    }
    if (citeKeyFormatRemaining.length > 0) {
        basekey = basekey + citeKeyFormatRemaining;
    }

    // for now, remove any characters not explicitly known to be allowed;
    // we might want to allow UTF-8 citation keys in the future, depending
    // on implementation support.
    //
    // no matter what, we want to make sure we exclude
    // " # % ' ( ) , = { } ~ and backslash
    // however, we want to keep the base characters 

    basekey = tidyAccents(basekey);
    basekey = basekey.replace(citeKeyCleanRe, "");
    var citekey = basekey;
    var i = 0;
    while(citekeys[citekey]) {
        i++;
        citekey = basekey + "-" + i;
    }
    citekeys[citekey] = true;
    return citekey;
}

function doExport() {
	Zotero.write("\n");
	
	var citekeys = new Object();
	var item;
	Zotero.write("<batch>");
	while(item = Zotero.nextItem()) {
		// determine type
		var type = zotero2bibtexTypeMap[item.itemType];
		if (typeof(type) == "function") { type = type(item); }
		if(!type) type = "misc";
		
		// create a unique citation key
		var citekey = buildCiteKey(item, citekeys);
		
		// write citation key
		Zotero.write("\n<entry id=\"" + citekey + "\">\n<" + type + ">");
		
		// Next, build a map of all stored fields for the item. The map is 
		// keyed by the field name, and each key maps to a list of all
		// values for the specified field. This is required as BibTeXML requires
		// that entries occur in specific orders, and all entries must be known
		// before the final XML can be written.
		var itemFieldsMap = {};
		var mapKeys = [];
		
		for(var field in fieldMap) {
			if(item[fieldMap[field]]) {
				storeField(field, item[fieldMap[field]], itemFieldsMap, mapKeys);
			}
		}

		if(item.reportNumber || item.issue || item.seriesNumber) {
			storeField("number", item.reportNumber || item.issue || item.seriesNumber
				, itemFieldsMap, mapKeys);
		}

		if(item.publicationTitle) {
			if(item.itemType == "bookSection" || item.itemType == "conferencePaper") {
				storeField("booktitle", item.publicationTitle, itemFieldsMap, mapKeys);
			} else {
				storeField("journal", item.publicationTitle, itemFieldsMap, mapKeys);
			}
		}
		
		if(item.publisher) {
			if(item.itemType == "thesis") {
				storeField("school", item.publisher, itemFieldsMap, mapKeys);
			} else if(item.itemType =="report") {
				storeField("institution", item.publisher, itemFieldsMap, mapKeys);
			} else {
				storeField("publisher", item.publisher, itemFieldsMap, mapKeys);
			}
		}
		
		if(item.creators && item.creators.length) {
			for each(var creator in item.creators) {
				var creatorString = creator.lastName;
				if (creator.firstName) {
					creatorString = creator.lastName + ", " + creator.firstName;
				}
				
				if(creator.creatorType == "editor") {
					storeField("editor", creatorString, itemFieldsMap, mapKeys);
				} else {
					storeField("author", creatorString, itemFieldsMap, mapKeys);
				}
			}
		}
		
		if(item.date) {
			var date = Zotero.Utilities.strToDate(item.date);
			// need to use non-localized abbreviation
			if(typeof date.month == "number") {
				storeField("month", months[date.month], itemFieldsMap, mapKeys);
			}
			if(date.year) {
				storeField("year", date.year, itemFieldsMap, mapKeys);
			}
		}
		
		if(item.extra) {
			storeField("note", item.extra, itemFieldsMap, mapKeys);
		}
		
		if(item.tags && item.tags.length) {
			var tagString = "";
			for each(var tag in item.tags) {
				tagString += ", "+tag.tag;
			}
			storeField("keywords", tagString.substr(2), itemFieldsMap, mapKeys);
		}
		
		if(item.pages) {
			storeField("pages", item.pages.replace("–", "-").replace("-","--"), itemFieldsMap, mapKeys);
		}
		
		// Commented out, because we don't want a books number of pages in the 
		// BibTeX "pages" field for books.
		//if(item.numPages) {
		//	storeField("pages", item.numPages);
		//}
		
		if(item.itemType == "webpage") {
			storeField("howpublished", item.url, itemFieldsMap, mapKeys);
		}
		
		// Disable the export of notes for now
		/*
		if (item.notes && Zotero.getOption("exportNotes")) {
			for each (var note in item.notes) {
				storeField("annote", Zotero.Utilities.unescapeHTML(note["note"]));
			}
		}
		*/		
		
		if(Zotero.getOption("exportFileData")) {
			if(item.attachments) {
				for each(var attachment in item.attachments) {
					if(attachment.mimeType == "application/pdf") {
						var filename = attachment.filename;
						var renameCounter = 2;
						var saveSuccess = false;

						while(!saveSuccess) {
							try {
								attachment.saveItem(filename);
								saveSuccess = true;
							} catch (e) {
								if(e.message.indexOf("ERROR_FILE_EXISTS") >= 0) {
									filename = "[" + renameCounter + "]" + attachment.filename;
									renameCounter++;
								} else {
									throw e;
								}
							}
						}

						storeField("file", "file:" + attachment.filename, 
								itemFieldsMap, mapKeys);
					}
				}
			}
		}
		
		
		// Map of fields is complete, now write out the map in the order specified
		// by the publication type.
		for(var fieldIndex in bibtexmlFieldOrder[type]) {
			for(value in itemFieldsMap[bibtexmlFieldOrder[type][fieldIndex]]) {
				Zotero.write("\n<" + bibtexmlFieldOrder[type][fieldIndex] + ">" + itemFieldsMap[bibtexmlFieldOrder[type][fieldIndex]][value] + "</" + bibtexmlFieldOrder[type][fieldIndex] + ">");
			}
		}
		
		Zotero.write("\n</" + type + ">");
		if(!(itemFieldsMap["file"] == undefined)) {
			for(value in itemFieldsMap["file"]) {
				Zotero.write("\n<file>" + itemFieldsMap["file"][value] + "</file>");
			}
		}
		Zotero.write("\n</entry>");
	}
	Zotero.write("\n</batch>");
}
