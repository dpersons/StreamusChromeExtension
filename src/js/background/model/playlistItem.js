﻿define([
    'background/model/settings',
    'background/model/song'
], function (Settings, Song) {
    'use strict';
    
    var PlaylistItem = Backbone.Model.extend({
        defaults: function() {
            return {
                id: null,
                playlistId: null,
                sequence: -1,
                title: '',
                selected: false,
                firstSelected: false,
                
                song: null
            };
        },
        
        //  TODO: Move this to PlaylistItems
        urlRoot: Settings.get('serverURL') + 'PlaylistItem/',
        
        parse: function (playlistItemDto) {
            
            //  Convert C# Guid.Empty into BackboneJS null
            for (var key in playlistItemDto) {
                if (playlistItemDto.hasOwnProperty(key) && playlistItemDto[key] === '00000000-0000-0000-0000-000000000000') {
                    playlistItemDto[key] = null;
                }
            }

            // Take json of song and set into model. Delete to prevent overriding on return of data object.
            this.get('song').set(playlistItemDto.song);
            delete playlistItemDto.song;

            return playlistItemDto;
        },
        
        toJSON: function () {
            //  Backbone Model's toJSON doesn't automatically send cid across, but I want it for re-mapping collections after server saves.
            var json = Backbone.Model.prototype.toJSON.apply(this, arguments);
            json.cid = this.cid;
            return json;
        },

        initialize: function () {
            var song = this.get('song');

            //  Need to convert song object to Backbone.Model
            if (!(song instanceof Backbone.Model)) {
                song = new Song(song);
                //  Silent because song is just being properly set.
                this.set('song', song, { silent: true });
            }
            
            //  Ensure that the Song's title is propagated up to its parent when unset. 
            //  PlaylistItem's title could be edited so only copy when its blank.
            if (this.get('title') === '') {
                this.set('title', song.get('title'));
            }
        }
    });

    return PlaylistItem;
});