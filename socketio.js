/**
* Copyright Gallimberti Telemaco 02/02/2017
  Copyright Heinrich Reimer 2017
**/

module.exports = function(RED) {
	
		var Server = require('socket.io');
		var SocketIOFileUpload = require('socketio-file-upload');
		var express = require('express');
		var mkdirp = require('mkdirp');
		const path = require("path");		
		
		var io;
		var customProperties = {};
		var sockets = [];
		
		function socketIoConfig(n) {
			RED.nodes.createNode(this,n);
			// node-specific code goes here
			var node = this;
			this.port = n.port || 80;
			this.sendClient = n.sendClient;
			this.clientServePath = n.clientServePath || "/public";
			this.uploadFolder = n.uploadFolder || "workFolder/uploads";
			this.resultsFolder = n.resultsFolder || "workFolder/results";
			this.path = n.path || "/socket.io/socket.io.js";
			this.bindToNode = n.bindToNode || false;
			
			if(this.bindToNode){
				io = new Server(RED.server);
			} else {
				var currentWorkingDir = process.env.PWD;
				var app = express()
				.use(SocketIOFileUpload.router)
				.use(express.static(currentWorkingDir + node.clientServePath))
				.listen(node.port);
	
				io = new Server(app);
				io.serveClient(node.sendClient);
				io.path(node.path);
				//io.listen(node.port);
			}
			var bindOn =  this.bindToNode ? "bind to Node-red port" : ("on port " + this.port);
			node.log("Created server " + bindOn);
			
			const resultsFolderPath = node.resultsFolder;
			const uploadsFolderPath = node.uploadFolder;
			
			mkdirp(resultsFolderPath, function(err){
				if (err) {
				  node.log(err);
				}
			});
			mkdirp(uploadsFolderPath, function(err){
				if (err) {
				  node.log(err);
				}
			});
			
			node.on('close', function() {
				if (!this.bindToNode) {
					io.close();
				}
				sockets.forEach(function(socket) {
					node.log('disconnect:' + socket.id);
					socket.disconnect(true);
				});
				sockets = [];
			});
			
		}
		
		function socketIoIn(n) {
			RED.nodes.createNode(this,n);
			// node-specific code goes here
			var node = this;
			this.name = n.name;
			this.server = RED.nodes.getNode(n.server);
			this.rules = n.rules || [];
			
			this.specialIOEvent = [{v:"error"},{v:"connect"},{v:"disconnect"},
				{v:"disconnecting"},{v:"newListener"},{v:"removeListener"},{v:"ping"},{v:"pong"}];
				
			//add listener to socket, for now return nothing
			function addListener(socket, val, i){
				socket.on(val.v, function(msgin){
					//node.log("Registered new " + val.v + " event");
					var msg = {};
					RED.util.setMessageProperty(msg, "payload", msgin, true);
					RED.util.setMessageProperty(msg, "socketIOEvent", val.v, true);
					//Throw error  TypeError: Cannot set property listening of #<Server> which has only a getter
					// this is to solve
					//messages into node-red are cloned when they are send
					//so we can't sand socket... =(
					//RED.util.setMessageProperty(msg, "socket", socket, true);
					RED.util.setMessageProperty(msg, "socketIOId", socket.id, true);
					if(customProperties[RED.util.getMessageProperty(msg,"socketIOId")]!= null){
						RED.util.setMessageProperty(msg, "socketIOStaticProperties", customProperties[RED.util.getMessageProperty(msg,"socketIOId")], true);
					}
					node.send(msg);
					});
			}
			
			io.on('connection', function(socket){
				node.log("New connection to: " + socket.id);
				sockets.push(socket);
	
				
				// Handle File Uploads
				var serverCfg = RED.nodes.getNode(n.server);
								
				handleFileUploads(serverCfg, socket);
	
				node.rules.forEach(function(val, i){
					addListener(socket, val, i);
				});
				//Adding support for all other special messages
				node.specialIOEvent.forEach(function(val, i){
					addListener(socket, val, i);
				});
			});
		
		}
		
		function socketIoOut(n) {
			RED.nodes.createNode(this,n);
			// node-specific code goes here
			var node = this;
			this.name = n.name;
			this.server = RED.nodes.getNode(n.server);
			
			node.on('input', function(msg) {
			// do something with 'msg'
				//node.log("Ecoing message");
				//console.log(customProperties);
				//console.log(customProperties[RED.util.getMessageProperty(msg,"socketIOId")]);
				/*console.log(io.sockets.sockets[RED.util.getMessageProperty(msg,"socketIOId")]);
				if(Object.prototype.toString.call(io.sockets.sockets[RED.util.getMessageProperty(msg,"socketIOId")]) === '[object Array]')
				{
					console.log("io.sockets.sockets is an array!! urray!!");
				}
				else
				{
					console.log("io.sockets.sockets is NOT an array!");
					console.log(Object.prototype.toString.call(io.sockets.sockets[RED.util.getMessageProperty(msg,"socketIOId")]));
				}*/
				//check if we need to add properties
				if(RED.util.getMessageProperty(msg,"socketIOAddStaticProperties"))
				{
					//check if we have already added some properties for this socket
					if(customProperties[RED.util.getMessageProperty(msg,"socketIOId")]!= null){
						//check if object as property
						var keys = Object.getOwnPropertyNames(RED.util.getMessageProperty(msg,"socketIOAddStaticProperties"));
						//console.log(keys);
						var tmp = customProperties[RED.util.getMessageProperty(msg,"socketIOId")];
						for(var i = 0; i < keys.length; i++){
							tmp[keys[i]] = RED.util.getMessageProperty(msg,"socketIOAddStaticProperties")[keys[i]];
						}
						//console.log("-After add or modify-");
						//console.log(customProperties);
						//console.log("---------------------");
					}
					else{
						//add new properties
						customProperties[RED.util.getMessageProperty(msg,"socketIOId")] = RED.util.getMessageProperty(msg,"socketIOAddStaticProperties");
					}
				}
						
				switch(RED.util.getMessageProperty(msg,"socketIOEmit")) {
					case "broadcast.emit":
						//ritorno a tutti tranne che al chiamante
						io.sockets.sockets[RED.util.getMessageProperty(msg,"socketIOId")].broadcast.emit(msg.socketIOEvent , msg.payload);
						console.log("broadcast.emit");
						break;
					case "emit":
						//ritorno solo al chiamante
						io.sockets.sockets[RED.util.getMessageProperty(msg,"socketIOId")].emit(msg.socketIOEvent , msg.payload);
						//console.log("emit");
						break;
					default:
					//emit to all
					io.emit(msg.socketIOEvent , msg.payload);
					//console.log("io.emit");
				}
			});
			
		}
	
		function handleFileUploads(node, socket) {
			// Make an instance of SocketIOFileUpload and listen on this socket:
			var uploader = new SocketIOFileUpload();
			uploader.dir = node.uploadFolder;
			uploader.listen(socket);
		
			// Do something when a file is saved:
			uploader.on("saved", function(event){
				console.log(event.file);
				event.file.clientDetail.pathName = event.file.pathName;
	
			});
		
			uploader.on('progress', function(event) {
				console.log(event.file.bytesLoaded / event.file.size)
				io.sockets.sockets[socket.id].emit("upload.progress", {
					percentage: (event.file.bytesLoaded / event.file.size) * 100
				});
			});
		
			// Error handler:
			uploader.on("error", function(event){
				console.log("Error from uploader", event);
			});
		}
		
		
	
		RED.nodes.registerType("socketio-config",socketIoConfig);
		RED.nodes.registerType("socketio-in",socketIoIn);
		RED.nodes.registerType("socketio-out",socketIoOut);
	}