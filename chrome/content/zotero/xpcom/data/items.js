/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/


/*
 * Primary interface for accessing Zotero items
 */
Zotero.Items = new function() {
	Zotero.DataObjects.apply(this, ['item']);
	this.constructor.prototype = new Zotero.DataObjects();
	
	// Privileged methods
	this.get = get;
	this.exist = exist;
	this.getAll = getAll;
	this.add = add;
	this.cacheFields = cacheFields;
	this.erase = erase;
	this.up2pSync = up2pSync;
	this.getFirstCreatorSQL = getFirstCreatorSQL;
	this.getSortTitle = getSortTitle;
	
	this.__defineGetter__('primaryFields', function () {
		if (!_primaryFields.length) {
			_primaryFields = Zotero.DB.getColumns('items');
			_primaryFields.splice(_primaryFields.indexOf('clientDateModified'), 1);
			_primaryFields = _primaryFields.concat(
				['firstCreator', 'numNotes', 'numAttachments']
			);
		}
		return _primaryFields;
	});
	
	
	// Private members
	var _cachedFields = [];
	var _firstCreatorSQL = '';
	var _primaryFields = [];
	
	
	/*
	 * Retrieves (and loads, if necessary) an arbitrary number of items
	 *
	 * Can be passed ids as individual parameters or as an array of ids, or both
	 *
	 * If only one argument and it's an id, return object directly;
	 * otherwise, return array
	 */
	function get() {
		var toLoad = [];
		var loaded = [];
		
		if (!arguments[0]) {
			Zotero.debug('No arguments provided to Items.get()');
			return false;
		}
		
		var ids = Zotero.flattenArguments(arguments);
		
		for (var i=0; i<ids.length; i++) {
			// Check if already loaded
			if (!this._objectCache[ids[i]]) {
				toLoad.push(ids[i]);
			}
		}
		
		// New items to load
		if (toLoad.length) {
			this._load(toLoad);
		}
		
		// If single id, return the object directly
		if (arguments[0] && typeof arguments[0]!='object'
				&& typeof arguments[1]=='undefined') {
			if (!this._objectCache[arguments[0]]) {
				Zotero.debug("Item " + arguments[0] + " doesn't exist", 2);
				return false;
			}
			return this._objectCache[arguments[0]];
		}
		
		// Otherwise, build return array
		for (i=0; i<ids.length; i++) {
			if (!this._objectCache[ids[i]]) {
				Zotero.debug("Item " + ids[i] + " doesn't exist", 2);
				continue;
			}
			loaded.push(this._objectCache[ids[i]]);
		}
		
		return loaded;
	}
	
	
	function exist(itemIDs) {
		var sql = "SELECT itemID FROM items WHERE itemID IN ("
			+ itemIDs.map(function () '?').join() + ")";
		var exist = Zotero.DB.columnQuery(sql, itemIDs);
		return exist ? exist : [];
	}
	
	
	
	/**
	 * Return items marked as deleted
	 *
	 * @param	{Boolean}	asIDs			Return itemIDs instead of
	 *											Zotero.Item objects
	 * @return	{Zotero.Item[]|Integer[]}
	 */
	this.getDeleted = function (asIDs, days) {
		var sql = "SELECT itemID FROM deletedItems";
		if (days) {
			sql += " WHERE dateDeleted<=DATE('NOW', '-" + parseInt(days) + " DAYS')";
		}
		var ids = Zotero.DB.columnQuery(sql);
		if (asIDs) {
			return ids;
		}
		return this.get(ids);
	}
	
	
	/*
	 * Returns all items in the database
	 *
	 * If |onlyTopLevel|, don't include child items
	 */
	function getAll(onlyTopLevel, libraryID, includeDeleted) {
		var sql = 'SELECT A.itemID FROM items A';
		if (onlyTopLevel) {
			sql += ' LEFT JOIN itemNotes B USING (itemID) '
			+ 'LEFT JOIN itemAttachments C ON (C.itemID=A.itemID) '
			+ 'WHERE B.sourceItemID IS NULL AND C.sourceItemID IS NULL';
		}
		else {
			sql += " WHERE 1";
		}
		if (!includeDeleted) {
			sql += " AND A.itemID NOT IN (SELECT itemID FROM deletedItems)";
		}
		if (libraryID) {
			sql += " AND libraryID=?";
			var ids = Zotero.DB.columnQuery(sql, libraryID);
		}
		else {
			sql += " AND libraryID IS NULL";
			var ids = Zotero.DB.columnQuery(sql);
		}
		return this.get(ids);
	}
	
	
	/*
	 * Create a new item with optional metadata and pass back the primary reference
	 *
	 * Using "var item = new Zotero.Item()" and "item.save()" directly results
	 * in an orphaned reference to the created item. If other code retrieves the
	 * new item with Zotero.Items.get() and modifies it, the original reference
	 * will not reflect the changes.
	 *
	 * Using this method avoids the need to call Zotero.Items.get() after save()
	 * in order to get the primary item reference. Since it accepts metadata
	 * as a JavaScript object, it also offers a simpler syntax than
	 * item.setField() and item.setCreator().
	 *
	 * Callers with no need for an up-to-date reference after save() (or who
	 * don't mind doing an extra Zotero.Items.get()) can use Zotero.Item
	 * directly if they prefer.
	 *
	 * Sample usage:
	 *
	 * var data = {
	 *     title: "Shakespeare: The Invention of the Human",
	 *     publisher: "Riverhead Hardcover",
	 *     date: '1998-10-26',
	 *     ISBN: 1573221201,
	 *     pages: 745,
	 *     creators: [
	 *         ['Harold', 'Bloom', 'author']
	 *     ]
	 * };
	 * var item = Zotero.Items.add('book', data);
	 */
	function add(itemTypeOrID, data) {
		var item = new Zotero.Item(itemTypeOrID);
		for (var field in data) {
			if (field == 'creators') {
				var i = 0;
				for each(var creator in data.creators) {
					// TODO: accept format from toArray()
					
					var fields = {
						firstName: creator[0],
						lastName: creator[1],
						fieldMode: creator[3] ? creator[3] : 0
					};
					
					var creatorDataID = Zotero.Creators.getDataID(fields);
					if (creatorDataID) {
						var linkedCreators = Zotero.Creators.getCreatorsWithData(creatorDataID);
						// TODO: identical creators?
						var creatorID = linkedCreators[0];
					}
					else {
						var creatorObj = new Zotero.Creator;
						creatorObj.setFields(fields);
						var creatorID = creatorObj.save();
					}
					
					item.setCreator(i, Zotero.Creators.get(creatorID), creator[2]);
					i++;
				}
			}
			else {
				item.setField(field, data[field]);
			}
		}
		var id = item.save();
		
		return this.get(id);
	}
	
	
	this.isPrimaryField = function (field) {
		return this.primaryFields.indexOf(field) != -1;
	}
	
	
	function cacheFields(fields, items) {
		if (items && items.length == 0) {
			return;
		}
		
		Zotero.debug("Caching fields [" + fields.join() + "]"
			+ (items ? " for " + items.length + " items" : ''));
		if (items && items.length > 0) {
			this._load(items);
		}
		else {
			this._load();
		}
		
		var primaryFields = [];
		var fieldIDs = [];
		for each(var field in fields) {
			// Check if field already cached
			if (_cachedFields.indexOf(field) != -1) {
				continue;
			}
			
			_cachedFields.push(field);
			
			if (this.isPrimaryField(field)) {
				primaryFields.push(field);
			}
			else {
				fieldIDs.push(Zotero.ItemFields.getID(field));
				if (Zotero.ItemFields.isBaseField(field)) {
					fieldIDs = fieldIDs.concat(Zotero.ItemFields.getTypeFieldsFromBase(field));
				}
			}
		}
		
		if (primaryFields.length) {
			var sql = "SELECT itemID, " + primaryFields.join(', ') + " FROM items";
			if (items) {
				sql += " WHERE itemID IN (" + items.join() + ")";
			}
			var rows = Zotero.DB.query(sql);
			for each(var row in rows) {
				//Zotero.debug('Calling loadFromRow for item ' + row.itemID);
				this._objectCache[row.itemID].loadFromRow(row);
			}
		}
		
		// All fields already cached
		if (!fieldIDs.length) {
			return;
		}
		
		var allItemIDs = Zotero.DB.columnQuery("SELECT itemID FROM items");
		var itemFieldsCached = {};
		
		var sql = "SELECT itemID, fieldID, value FROM itemData "
			+ "NATURAL JOIN itemDataValues WHERE ";
		if (items) {
			sql += "itemID IN (" + items.join() + ") AND ";
		}
		sql += "fieldID IN (" + fieldIDs.join() + ")";
		
		var itemDataRows = Zotero.DB.query(sql);
		for each(var row in itemDataRows) {
			//Zotero.debug('Setting field ' + row.fieldID + ' for item ' + row.itemID);
			if (this._objectCache[row.itemID]) {
				this._objectCache[row.itemID].setField(row.fieldID, row.value, true);
			}
			else {
				if (!missingItems) {
					var missingItems = {};
				}
				if (!missingItems[row.itemID]) {
					missingItems[row.itemID] = true;
					Components.utils.reportError("itemData row references nonexistent item " + row.itemID);
				}
			}
			
			if (!itemFieldsCached[row.itemID]) {
				itemFieldsCached[row.itemID] = {};
			}
			itemFieldsCached[row.itemID][row.fieldID] = true;
		}
		
		// If 'title' is one of the fields, load in note titles
		if (fields.indexOf('title') != -1) {
			var titleFieldID = Zotero.ItemFields.getID('title');
			var sql = "SELECT itemID, title FROM itemNotes WHERE itemID"
				+ " NOT IN (SELECT itemID FROM itemAttachments)";
			if (items) {
				sql += " AND itemID IN (" + items.join() + ")";
			}
			var rows = Zotero.DB.query(sql);
			
			for each(var row in rows) {
				//Zotero.debug('Setting title for note ' + row.itemID);
				if (this._objectCache[row.itemID]) {
					this._objectCache[row.itemID].setField(titleFieldID, row.title, true);
				}
				else {
					if (!missingItems) {
						var missingItems = {};
					}
					if (!missingItems[row.itemID]) {
						missingItems[row.itemID] = true;
						Components.utils.reportError("itemData row references nonexistent item " + row.itemID);
					}
				}
			}
		}
		
		// Set nonexistent fields in the cache list to false (instead of null)
		for each(var itemID in allItemIDs) {
			for each(var fieldID in fieldIDs) {
				if (Zotero.ItemFields.isValidForType(fieldID, this._objectCache[itemID].itemTypeID)) {
					if (!itemFieldsCached[itemID] || !itemFieldsCached[itemID][fieldID]) {
						//Zotero.debug('Setting field ' + fieldID + ' to false for item ' + itemID);
						this._objectCache[itemID].setField(fieldID, false, true);
					}
				}
			}
		}
	}
	
	
	this.merge = function (item, otherItems) {
		Zotero.DB.beginTransaction();
		
		var otherItemIDs = [];  
		var itemURI = Zotero.URI.getItemURI(item);
		
		for each(var otherItem in otherItems) {
			// Move child items to master
			var ids = otherItem.getAttachments(true).concat(otherItem.getNotes(true));
			for each(var id in ids) {
				var attachment = Zotero.Items.get(id);
				
				// TODO: Skip identical children?
				
				attachment.setSource(item.id);
				attachment.save();
			}
			
			// All other operations are additive only and do not affect the,
			// old item, which will be put in the trash
			
			// Add collections to master
			var collectionIDs = otherItem.getCollections();
			for each(var collectionID in collectionIDs) {
				var collection = Zotero.Collections.get(collectionID);
				collection.addItem(item.id);
			}
			
			// Add tags to master
			var tags = otherItem.getTags();
			for each(var tag in tags) {
				item.addTagByID(tag.id);
			}
			
			// Related items
			var relatedItems = otherItem.relatedItemsBidirectional;
			Zotero.debug(item._getRelatedItems(true));
			for each(var relatedItemID in relatedItems) {
				item.addRelatedItem(relatedItemID);
			}
			item.save();
			
			// Relations
			Zotero.Relations.copyURIs(
				item.libraryID,
				Zotero.URI.getItemURI(item),
				Zotero.URI.getItemURI(otherItem)
			);
			
			// Add relation to track merge
			var otherItemURI = Zotero.URI.getItemURI(otherItem);
			Zotero.Relations.add(item.libraryID, otherItemURI, Zotero.Relations.deletedItemPredicate, itemURI);
			
			// Trash other item
			otherItem.deleted = true;
			otherItem.save();
		}
		
		Zotero.DB.commitTransaction();
	}
	
	
	this.trash = function (ids) {
		ids = Zotero.flattenArguments(ids);
		
		Zotero.UnresponsiveScriptIndicator.disable();
		try {
			Zotero.DB.beginTransaction();
			for each(var id in ids) {
				var item = this.get(id);
				if (!item) {
					Zotero.debug('Item ' + id + ' does not exist in Items.trash()!', 1);
					Zotero.Notifier.trigger('delete', 'item', id);
					continue;
				}
				item.deleted = true;
				item.save();
			}
			Zotero.DB.commitTransaction();
		}
		catch (e) {
			Zotero.DB.rollbackTransaction();
			throw (e);
		}
		finally {
			Zotero.UnresponsiveScriptIndicator.enable();
		}
	}
	
	
	/**
	 * @param	{Integer}	days	Only delete items deleted more than this many days ago
	 */
	this.emptyTrash = function (days) {
		Zotero.DB.beginTransaction();
		var deletedIDs = this.getDeleted(true, days);
		if (deletedIDs) {
			this.erase(deletedIDs);
			Zotero.Notifier.trigger('refresh', 'collection', 0);
		}
		Zotero.DB.commitTransaction();
		return deletedIDs ? deletedIDs.length : 0;
	}
	
	
	/**
	 * Delete item(s) from database and clear from internal array
	 *
	 * @param	{Integer|Integer[]}	ids					Item ids
	 */
	function erase(ids) {
		ids = Zotero.flattenArguments(ids);
		
		var usiDisabled = Zotero.UnresponsiveScriptIndicator.disable();
		try {
			Zotero.DB.beginTransaction();
			for each(var id in ids) {
				var item = this.get(id);
				if (!item) {
					Zotero.debug('Item ' + id + ' does not exist in Items.erase()!', 1);
					continue;
				}
				item.erase(); // calls unload()
				item = undefined;
			}
			Zotero.DB.commitTransaction();
		}
		catch (e) {
			Zotero.DB.rollbackTransaction();
			throw (e);
		}
		finally {
			if (usiDisabled) {
				Zotero.UnresponsiveScriptIndicator.enable();
			}
		}
	}
	
	
	/**
	 * Attempts to synchronize items with the passed ID's with the UP2P node specified
	 * in the preferences
	 *
	 * @param	{Integer|Integer[]}	ids					Item ids
	 */
	function up2pSync(ids) {
		ids = Zotero.flattenArguments(ids);
		var successTitles = [];
		
		for each(var id in ids) {
			try {
				var newFiles = [];
				var usiDisabled = Zotero.UnresponsiveScriptIndicator.disable();
				Zotero.DB.beginTransaction();
				
				var attachFiles = [];
				var item = this.get(id);
				
				if (!item) {
					Zotero.debug('Item ' + id + ' does not exist in Items.up2pSync()!', 1);
					continue;
				}
				
				
				// ===== Make a duplicate copy of the item, including all attachments =====
				var newItem = new Zotero.Item(item.itemTypeID);
				// DEBUG: save here because clone() doesn't currently work on unsaved tagged items
				var newId = newItem.save();
				var newItem = Zotero.Items.get(newId);
				item.clone(false, newItem);
				
				// Make a new copy of any PDF attachments that were included with the resource
				var attachments = item.getAttachments();
				for (var i in attachments) {
					var attachment = Zotero.Items.get(attachments[i]);
					
					if(attachment.attachmentMIMEType == "application/pdf") {
						// Generate the new attachment item
						var newAttachment = new Zotero.Item(attachment.itemTypeID);
						attachment.clone(false, newAttachment, true);
						newAttachment.setSource(newId);
						
						// TODO: Reconsider this... do we really need to duplicate the 
						// attachments at all? The attachments will not have a resource ID,
						// and the contents will not need to be accessed once uploaded.
						// I'll leave it for now, it might be handy for doing reverse
						// synchronization.
						
						// newAttachment.up2pSync = true;
						var newAttachId = newAttachment.save();
						newAttachment = Zotero.Items.get(newAttachId);
						
						// Copy the actual file to the new attachment item's storage
						// location
						var file = attachment.getFile();
						// KLUDGE - Should use the new attachment location for the file upload,
						// Just use the old one for now
						attachFiles.push(
							{
							 name: "up2p:filename",
							 filename: file.leafName,
							 file: file
							}
						);
						
						var newStorageDir = Zotero.Attachments.getStorageDirectory(newAttachId);
						newFiles.push(newStorageDir.clone());
						file.copyTo(newStorageDir, file.leafName);
					}
				}
				newItem.save();
				
				// ===== Generate a BibTeXML file for the duplicated entry, and store it  =====
				// TODO: Might want to put this ID into the preferences pane
				var translator = Zotero.Translators.get("2539A338-98F5-11E0-9A51-59F44824019B");
				var up2pTranslator = new Zotero.Translate.Export();
				up2pTranslator.setTranslator(translator);
				up2pTranslator.setDisplayOptions({"exportCharset":"UTF-8", "exportFileData":true, "skipFileBinaries":true});
				up2pTranslator.setItems([newItem]);
				var exportLocation = Zotero.Attachments.getStorageDirectory(newId);
				newFiles.push(exportLocation.clone());
				if(!exportLocation.exists()) {
					exportLocation.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0700);
				}
				up2pTranslator.setLocation(exportLocation);
				up2pTranslator.translate(false, false);
				exportLocation.append(newItem.key + ".xml");
				
				
				// ===== Submit BibTeXML the file (and attachments) to UP2P =====
				var xmlString = Zotero.File.getContents(exportLocation);
				var commId = Zotero.Prefs.get("up2p.sync.community");
				var uploadUrl = Zotero.Prefs.get("up2p.sync.url") + "create";
						
				var textParams = [];
				textParams.push(
					{name: "up2p:community",
					 value: commId},
					{name: "up2p:rawxml",
					 value: xmlString},
					{name: "up2p:filename",
					 value: newItem.key + ".xml"},
					{name: "up2p:fetchxml",
					 value: "true"}
				);
				
				var responseStatus;
				
				try {
					var httpRequest = Zotero.HTTP.doMultipartPost(uploadUrl, textParams, attachFiles);
					responseStatus = httpRequest.status;
				} catch (e) {
					throw new Error("Error synchronizing " + item.getDisplayTitle(false) + ":\n"
							+ "Attempted connection to URL: " + uploadUrl 
							+ " failed to return a status code. Please check to ensure that the"
							+ " URL provided in the preferences page is valid.");
				}
				
				if (responseStatus == 200) {
					// Request was successful, check if the upload was successful
					Zotero.debug(httpRequest.responseText);
					var xmlRoot = httpRequest.responseXML.documentElement;
					var success = xmlRoot.getAttribute("success");
					if(success == "true") {
						// Get the resource ID
						var resId = xmlRoot.getElementsByTagName('resid')[0].firstChild.nodeValue;
						// TODO: Need to implement resource ID in the UP2P Synced items table
						newItem.up2pSync = true;
						newItem.up2pResId = resId;
						newItem.save();
						successTitles.push(item.getDisplayTitle(false));
					} else {
						var errorMsg = xmlRoot.getElementsByTagName('errmsg')[0].firstChild.nodeValue;
						throw new Error("Error synchronizing " + item.getDisplayTitle(false) + ":\n" 
								+ errorMsg);
					}
				} else {
					throw new Error("Error synchronizing " + item.getDisplayTitle(false) + ":\n"
							+ "Attempted connection to URL: " + uploadUrl 
							+ " returned status code: " + responseStatus);
				}
				
				Zotero.DB.commitTransaction();
			}
			catch (e) {
				Zotero.DB.rollbackTransaction();
				
				for each(var file in newFiles) {
					Zotero.debug("===== Cleaning up file: " + file.path);
					file.remove(true);
				}
				alert(e);
			}
			finally {
				if (usiDisabled) {
					Zotero.UnresponsiveScriptIndicator.enable();
				}
			}
		}
		
		if(successTitles.length > 0) {
			var successString = "Successfully synchronized resource(s):";
			for each(var title in successTitles) {
				successString = successString + "\n" + title;
			}
			alert(successString);
		}
	}
	
	
	/**
	 * Purge unused data values
	 */
	this.purge = function () {
		if (!Zotero.Prefs.get('purge.items')) {
			return;
		}
		
		var sql = "DELETE FROM itemDataValues WHERE valueID NOT IN "
					+ "(SELECT valueID FROM itemData)";
		Zotero.DB.query(sql);
		
		Zotero.Prefs.set('purge.items', false)
	}
	
	
	/*
	 * Generate SQL to retrieve firstCreator field
	 *
	 * Why do we do this entirely in SQL? Because we're crazy. Crazy like foxes.
	 */
	function getFirstCreatorSQL() {
		if (_firstCreatorSQL) {
			return _firstCreatorSQL;
		}
		
		/* This whole block is to get the firstCreator */
		var localizedAnd = Zotero.getString('general.and');
		var sql = "COALESCE(" +
			// First try for primary creator types
			"CASE (" +
				"SELECT COUNT(*) FROM itemCreators IC " +
				"LEFT JOIN itemTypeCreatorTypes ITCT " +
				"ON (IC.creatorTypeID=ITCT.creatorTypeID AND ITCT.itemTypeID=I.itemTypeID) " +
				"WHERE itemID=I.itemID AND primaryField=1" +
			") " +
			"WHEN 0 THEN NULL " +
			"WHEN 1 THEN (" +
				"SELECT lastName FROM itemCreators IC NATURAL JOIN creators " +
				"NATURAL JOIN creatorData " +
				"LEFT JOIN itemTypeCreatorTypes ITCT " +
				"ON (IC.creatorTypeID=ITCT.creatorTypeID AND ITCT.itemTypeID=I.itemTypeID) " +
				"WHERE itemID=I.itemID AND primaryField=1" +
			") " +
			"WHEN 2 THEN (" +
				"SELECT " +
				"(SELECT lastName FROM itemCreators IC NATURAL JOIN creators " +
				"NATURAL JOIN creatorData " +
				"LEFT JOIN itemTypeCreatorTypes ITCT " +
				"ON (IC.creatorTypeID=ITCT.creatorTypeID AND ITCT.itemTypeID=I.itemTypeID) " +
				"WHERE itemID=I.itemID AND primaryField=1 ORDER BY orderIndex LIMIT 1)" +
				" || ' " + localizedAnd + " ' || " +
				"(SELECT lastName FROM itemCreators IC NATURAL JOIN creators " +
				"NATURAL JOIN creatorData " +
				"LEFT JOIN itemTypeCreatorTypes ITCT " +
				"ON (IC.creatorTypeID=ITCT.creatorTypeID AND ITCT.itemTypeID=I.itemTypeID) " +
				"WHERE itemID=I.itemID AND primaryField=1 ORDER BY orderIndex LIMIT 1,1)" +
			") " +
			"ELSE (" +
				"SELECT " +
				"(SELECT lastName FROM itemCreators IC NATURAL JOIN creators " +
				"NATURAL JOIN creatorData " +
				"LEFT JOIN itemTypeCreatorTypes ITCT " +
				"ON (IC.creatorTypeID=ITCT.creatorTypeID AND ITCT.itemTypeID=I.itemTypeID) " +
				"WHERE itemID=I.itemID AND primaryField=1 ORDER BY orderIndex LIMIT 1)" +
				" || ' et al.' " +
			") " +
			"END, " +
			
			// Then try editors
			"CASE (" +
				"SELECT COUNT(*) FROM itemCreators WHERE itemID=I.itemID AND creatorTypeID IN (3)" +
			") " +
			"WHEN 0 THEN NULL " +
			"WHEN 1 THEN (" +
				"SELECT lastName FROM itemCreators NATURAL JOIN creators " +
				"NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (3)" +
			") " +
			"WHEN 2 THEN (" +
				"SELECT " +
				"(SELECT lastName FROM itemCreators NATURAL JOIN creators NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (3) ORDER BY orderIndex LIMIT 1)" +
				" || ' " + localizedAnd + " ' || " +
				"(SELECT lastName FROM itemCreators NATURAL JOIN creators NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (3) ORDER BY orderIndex LIMIT 1,1) " +
			") " +
			"ELSE (" +
				"SELECT " +
				"(SELECT lastName FROM itemCreators NATURAL JOIN creators NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (3) ORDER BY orderIndex LIMIT 1)" +
				" || ' et al.' " +
			") " +
			"END, " +
			
			// Then try contributors
			"CASE (" +
				"SELECT COUNT(*) FROM itemCreators WHERE itemID=I.itemID AND creatorTypeID IN (2)" +
			") " +
			"WHEN 0 THEN NULL " +
			"WHEN 1 THEN (" +
				"SELECT lastName FROM itemCreators NATURAL JOIN creators " +
				"NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (2)" +
			") " +
			"WHEN 2 THEN (" +
				"SELECT " +
				"(SELECT lastName FROM itemCreators NATURAL JOIN creators NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (2) ORDER BY orderIndex LIMIT 1)" +
				" || ' " + localizedAnd + " ' || " +
				"(SELECT lastName FROM itemCreators NATURAL JOIN creators NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (2) ORDER BY orderIndex LIMIT 1,1) " +
			") " +
			"ELSE (" +
				"SELECT " +
				"(SELECT lastName FROM itemCreators NATURAL JOIN creators NATURAL JOIN creatorData " +
				"WHERE itemID=I.itemID AND creatorTypeID IN (2) ORDER BY orderIndex LIMIT 1)" +
				" || ' et al.' " +
			") " +
			"END" +
		") AS firstCreator";
		
		_firstCreatorSQL = sql;
		return sql;
	}
	
	
	function getSortTitle(title) {
		if (!title) {
			return '';
		}
		if (typeof title == 'number') {
			return title + '';
		}
		return title.replace(/^[\[\'\"](.*)[\'\"\]]?$/, '$1')
	}
	
	
	this._load = function () {
		if (!arguments[0] && !this._reloadCache) {
			return;
		}
		
		// Should be the same as parts in Zotero.Item.loadPrimaryData
		var sql = 'SELECT I.*, '
			+ getFirstCreatorSQL() + ', '
			+ "(SELECT COUNT(*) FROM itemNotes INo WHERE sourceItemID=I.itemID AND "
			+ "INo.itemID NOT IN (SELECT itemID FROM deletedItems)) AS numNotes, "
			+ "(SELECT COUNT(*) FROM itemAttachments IA WHERE sourceItemID=I.itemID AND "
			+ "IA.itemID NOT IN (SELECT itemID FROM deletedItems)) AS numAttachments "
			+ 'FROM items I WHERE 1';
		if (arguments[0]) {
			sql += ' AND I.itemID IN (' + Zotero.join(arguments[0], ',') + ')';
		}
		var itemsRows = Zotero.DB.query(sql);
		var itemIDs = [];
		for each(var row in itemsRows) {
			var itemID = row.itemID;
			itemIDs.push(itemID);
			
			// Item doesn't exist -- create new object and stuff in array
			if (!this._objectCache[row.itemID]) {
				var item = new Zotero.Item();
				item.loadFromRow(row, true);
				this._objectCache[row.itemID] = item;
			}
			// Existing item -- reload in place
			else {
				this._objectCache[row.itemID].loadFromRow(row, true);
			}
		}
		
		// If loading all items, remove old items that no longer exist
		if (!arguments[0]) {
			for each(var c in this._objectCache) {
				if (itemIDs.indexOf(c.id) == -1) {
					this.unload(c.id);
				}
			}
			
			_cachedFields = ['itemID', 'itemTypeID', 'dateAdded', 'dateModified',
				'firstCreator', 'numNotes', 'numAttachments', 'numChildren'];
			this._reloadCache = false;
		}
	}
}

