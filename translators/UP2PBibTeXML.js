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

/** 
 * Map used for export mapping when values require no modification (other than XML escaping)
 */
var exportFieldMap = {
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

/** 
 * Map used for import mapping when values require no modification (other than XML decoding) 
 */
var inputFieldMap = {
	title:"title",
	volume:"volume",
	place:"address",
	url:"howpublished",
	type:"type",
	series:"series",
	chapter:"chapter",
	edition:"edition"
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
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// -------------------------------------------------------------------
// ---------------- Import Translator Implementation  ---------------- 
// -------------------------------------------------------------------

/** 
 * Checks that the format of the specified XML file matches BibTeXML / U-P2P batch format.
 * This does not perform full schema validation, but rather only checks that all second level
 * children of the root element are called "entry".
 */
function detectImport() {
	// For now, check that all first level children of the processed XML
	// have the tag name "entry" (could also check that second level children are valid
	// BibTeXML types, but root tag can be anything)
	var xml = Zotero.getXML();
	var name = xml.name();
	if (!name) {
		return false;
	}
	
	var childList = xml.*;
	if(childList.length() == 0) {
		return false;
	}
	
	for each (var child in childList) {
		if(child.name() != "entry") {
			return false;
		}
	}

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

/**
 * Reads a list of citation data in BibTeXML format it and converts them into Zotero items.
 * The items are saved as long as a valid itemType is read.
 */
function doImport() {
	var xml = Zotero.getXML();
	var childList = xml.*;
	
	var i = 0;
	for each (var entryRoot in childList) {
		var isValid = false;
		var newItem = new Zotero.Item();
		
		// Get the item type of the item
		var bibtexmlItemType;
		for each(var entryType in entryRoot.*) {
			if(entryType.name() == "file") {
				// Attachment field for the entry, ignore for now
				continue;
			} else {
				bibtexmlItemType = entryType.name();
				newItem.itemType = bibtex2zoteroTypeMap[bibtexmlItemType];
				isValid = true;
			}
		}
		
		// Get all the fields specified in the inputFieldMap (values for these fields require no
		// special processing, and can just be copied unmodified to the Zotero item)
		for each(var xmlTag in entryRoot.*.*) {
			for(var field in inputFieldMap) {
				if(xmlTag.name() == inputFieldMap[field]) {
					newItem[field] = xmlDecode(xmlTag);
					break; // Each XML tag should only correspond to 1 field
				}
			}
		}
		
		// Get the author / editors of the piece (requires special processing to generate
		// creator objects)
		for each(var author in entryRoot.*.author) {
			var creator = buildCreatorObj(xmlDecode(author), "author");
			newItem.creators.push(creator);
		}
		for each(var editor in entryRoot.*.editor) {
			var creator = buildCreatorObj(xmlDecode(editor), "editor");
			newItem.creators.push(creator);
		}
		
		// If a journal or booktitle is specified, store it as the publicationTitle
		// (Multiple fields in BibTeXML map to publicationTitle in Zotero)
		for each(var pubTitle in entryRoot.*.booktitle) {
			newItem.publicationTitle = xmlDecode(pubTitle);
		}
		for each(var pubTitle in entryRoot.*.journal) {
			newItem.publicationTitle = xmlDecode(pubTitle);
		}
		
		// Get the publisher (multiple fields in BibTeXML map to publisher in Zotero)
		for each(var publisher in entryRoot.*.publisher) {
			newItem.publisher = xmlDecode(publisher);
		}
		for each(var publisher in entryRoot.*.institution) {
			newItem.publisher = xmlDecode(publisher);
		}
		for each(var publisher in entryRoot.*.school) {
			newItem.publisher = xmlDecode(publisher);
		}
		
		// Get the publication date (date requires month / year processing)
		var dateString = "";
		for each(var month in entryRoot.*.month) {
			dateString += month + " ";
		}
		for each(var year in entryRoot.*.year) {
			dateString += year;
		}
		if(dateString != "") {
			newItem.date = xmlDecode(dateString);
		}
		
		// Read the "number" field based on the type of element
		for each(var number in entryRoot.*.number) {
			if(bibtexmlItemType == "techreport") {
				newItem.reportNumber = xmlDecode(number);
			} else if (bibtexmlItemType == "article") {
				newItem.issue = xmlDecode(number);
			} else {
				newItem.seriesNumber = xmlDecode(number);
			}
		}
		
		// Read the "pages" field, converting TeX style double dashes back to a single dash
		for each(var pages in entryRoot.*.pages) {
			newItem.pages = xmlDecode(pages.replace("--", "–"));
		}
		
		if(isValid) {
			newItem.complete();
		} else {
			Zotero.debug("Invalid item found in BibTeXML import, skipping item: " + i);
		}
		
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


// -------------------------------------------------------------------
// ---------------- Export Translator Implementation  ---------------- 
// -------------------------------------------------------------------

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

/**
 * Stores the specified field value into the provided fieldMap with the provided field name.
 * A new entry is also created in the mapKeys list, which stores the listing of all field
 * names which have been added to the fieldMap.
 */
function storeField(field, value, fieldMap, mapKeys) {
	if(!value && typeof value != "number") return;
	value = value + ""; // Convert integers to strings
	value = xmlEscape(value); // Replace XML characters with escape sequences
	
	if(fieldMap[field] == undefined) {
		fieldMap[field] = [value];
		mapKeys.push(field);
	} else {
		fieldMap[field].push(value);
	}
}

/** 
 * A little substitution function for BibTeX keys, where we don't want LaTeX 
 * escaping, but we do want to preserve the base characters
 */
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

/** 
 * Below is a list of words that should not appear as part of the citation key
 * in includes the indefinite articles of English, German, French and Spanish, as well as a small 
 * set of English prepositions whose force is more grammatical than lexical, i.e. which are likely 
 * to strike many as 'insignificant'.
 * The assumption is that most who want a title word in their key would prefer the first word of
 * significance.
 */
var citeKeyTitleBannedRe = /\b(a|an|the|some|from|on|in|to|of|do|with|der|die|das|ein|eine|einer|eines|einem|einen|un|une|la|le|l\'|el|las|los|al|uno|una|unos|unas|de|des|del|d\')(\s+|\b)/g;
var citeKeyConversionsRe = /%([a-zA-Z])/;
var citeKeyCleanRe = /[^a-z0-9\*\+\-\.\[\]\_]+/g;

/**
 * Helper functions for generation of citation keys 
 */
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

/**
 * Generates and returns a citation key for the passed item, ensuring that it is unique
 * among the passed list of citation keys.
 */
function buildCiteKey (item,citekeys) {
    var basekey = "";
    var counter = 0;
    citeKeyFormatRemaining = citeKeyFormat;
    while (citeKeyConversionsRe.test(citeKeyFormatRemaining)) {
        if (counter > 100) {
            //Zotero.debug("Pathological BibTeX format: " + citeKeyFormat);
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
            //Zotero.debug("Got value " + value + " for %" + m[1]);
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

/**
 * Generates a U-P2P / BibTeXML batch XML file from the exported items. PDF attachments
 * are also optionally exported.
 */
function doExport() {
	Zotero.write('<?xml version="1.0" encoding="UTF-8" ?>');
	
	var citekeys = new Object();
	// KLUDGE - Sandbox provides no way to get the number of entries being exported.
	// Instead, read all the entries into an array and check the size of the array.
	
	var exportItems = [];
	var exportItem;
	while(exportItem = Zotero.nextItem()) {
		exportItems.push(exportItem);
	}
	
	if(exportItems.length > 1) {
		Zotero.write("\n<batch>");
	}
	
	for each(var item in exportItems) {
		// Determine type
		var type = zotero2bibtexTypeMap[item.itemType];
		if (typeof(type) == "function") { type = type(item); }
		
		if(!type) {
			// Skip this item if no equivalent bibtexml type could be found
			// (probably an attachment)
			continue;
		}
		
		// Create a unique citation key
		var citekey = buildCiteKey(item, citekeys);
		
		// Write citation key
		Zotero.write("\n<entry id=\"" + citekey + "\">\n<" + type + ">");
		
		// Next, build a map of all stored fields for the item. The map is 
		// keyed by the field name, and each key maps to a list of all
		// values for the specified field. This is required as BibTeXML requires
		// that entries occur in specific orders, and all entries must be known
		// before the final XML can be written.
		var itemFieldsMap = {};
		var mapKeys = [];
		
		// Store all fields in the exportFieldMap (these fields require no extra processing beyond
		// XML escaping their values)
		for(var field in exportFieldMap) {
			if(item[exportFieldMap[field]]) {
				storeField(field, item[exportFieldMap[field]], itemFieldsMap, mapKeys);
			}
		}

		// Write out the number field (the reportNumber, issue, and seriesNumber fields should be
		// mutually exclusive on the original item
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
		
		// Fill out the "school", "institution", or "publisher" field based on the type of the
		// publication
		if(item.publisher) {
			if(item.itemType == "thesis") {
				storeField("school", item.publisher, itemFieldsMap, mapKeys);
			} else if(item.itemType =="report") {
				storeField("institution", item.publisher, itemFieldsMap, mapKeys);
			} else {
				storeField("publisher", item.publisher, itemFieldsMap, mapKeys);
			}
		}
		
		// Write out item creators in "lastName, firstName" format
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
		
		if(item.pages) {
			storeField("pages", item.pages.replace("--", "–").replace("–", "-").replace("-","--"), itemFieldsMap, mapKeys);
		}
		
		if(item.date) {
			var date = Zotero.Utilities.strToDate(item.date);
			// Need to use non-localized abbreviation
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
		
		// Write out the URL to the "howpublished" field for web pages
		if(item.itemType == "webpage") {
			storeField("howpublished", item.url, itemFieldsMap, mapKeys);
		}
		
		// Disable the export of notes for now (need to generate a new XML file, probably not
		// possible with standard Zotero sandbox)
		/*
		if (item.notes && Zotero.getOption("exportNotes")) {
			for each (var note in item.notes) {
				storeField("annote", Zotero.Utilities.unescapeHTML(note["note"]));
			}
		}
		*/
		
		// Export PDF file attachments if exportFileData is set
		if(Zotero.getOption("exportFileData")) {
			if(item.attachments) {
				for each(var attachment in item.attachments) {
					if(attachment.mimeType == "application/pdf") {
						var filename = attachment.filename;
						if (Zotero.getOption("skipFileBinaries")) {
							// Do nothing
						} else {
							var renameCounter = 2;
							var saveSuccess = false;

							// Save the attachment, renaming if necessary if a file name conflict
							// occurs
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
						}
						
						storeField("file", "file:" + filename, 
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
		
		// Write out the path to the file attachment (if one exists)
		if(!(itemFieldsMap["file"] == undefined)) {
			for(value in itemFieldsMap["file"]) {
				Zotero.write("\n<file>" + itemFieldsMap["file"][value] + "</file>");
			}
		}
		Zotero.write("\n</entry>");
	}
	
	if(exportItems.length > 1) {
		Zotero.write("\n</batch>");
	}
}