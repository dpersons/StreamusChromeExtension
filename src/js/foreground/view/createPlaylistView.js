﻿define([
    'background/collection/playlists',
    'background/collection/streamItems',
    'common/enum/dataSourceType',
    'common/model/dataSource',
    'text!template/createPlaylist.html'
], function (Playlists, StreamItems, DataSourceType, DataSource, CreatePlaylistTemplate) {
    'use strict';

    var CreatePlaylistView = Backbone.Marionette.ItemView.extend({

        className: 'create-playlist',

        template: _.template(CreatePlaylistTemplate),
        
        templateHelpers: function () {
            return {
                'requiredMessage': chrome.i18n.getMessage('required'),
                'titleLowerCaseMessage': chrome.i18n.getMessage('title').toLowerCase(),
                'optionalMessage': chrome.i18n.getMessage('optional'),
                'playlistMessage': chrome.i18n.getMessage('playlist'),
                'playlistLowerCaseMessage': chrome.i18n.getMessage('playlist').toLowerCase(),
                'urlMessage': chrome.i18n.getMessage('url'),
                'channelLowerCaseMessage': chrome.i18n.getMessage('channel').toLowerCase(),
                'playlistCount': Playlists.length
            };
        },
        
        ui: {
            'playlistTitleInput': 'input.playlist-title',
            'youTubeSourceInput': 'input.youtube-source'
        },

        events: {
            'input @ui.youTubeSourceInput': 'processInput',
            'input @ui.playlistTitleInput': 'validateTitle'
        },

        onRender: function () {
            this.setDataSourceAsUserInput();

            //  TODO: Maybe when/if I use onShow to show these views I can remove this setTimeout.
            setTimeout(function () {
                //  Reset the value after focusing to focus without selecting.
                this.ui.playlistTitleInput.focus().val(this.ui.playlistTitleInput.val());
            }.bind(this));
        },
        
        validateTitle: function() {
            //  When the user submits - check to see if they provided a playlist name
            var playlistTitle = $.trim(this.ui.playlistTitleInput.val());
            this.ui.playlistTitleInput.toggleClass('invalid', playlistTitle === '');
        },
        
        //  Debounce for typing support so I know when typing has finished
        processInput: _.debounce(function () {

            //  Wrap in a setTimeout to let drop event finish (no real noticeable lag but keeps things DRY easier)
            setTimeout(function() {

                var youTubeUrl = $.trim(this.ui.youTubeSourceInput.val());
                this.ui.youTubeSourceInput.removeData('datasource').removeClass('valid invalid');

                if (youTubeUrl !== '') {

                    //  Check validity of URL and represent validity via invalid class.
                    var dataSource = new DataSource({
                        urlToParse: youTubeUrl,
                        parseVideo: false
                    });

                    this.ui.youTubeSourceInput.data('datasource', dataSource);

                    dataSource.getTitle({
                        success: function(title) {
                            this.ui.playlistTitleInput.val(title);
                            this.validateTitle();
                            this.ui.youTubeSourceInput.addClass('valid');
                        }.bind(this),
                        error: function () {
                            var originalValue = this.ui.playlistTitleInput.val();
                            this.ui.playlistTitleInput.data('original-value', originalValue).val(chrome.i18n.getMessage('errorRetrievingTitle'));
                            this.ui.youTubeSourceInput.addClass('invalid');
                        }.bind(this)
                    });

                } else {
                    this.ui.youTubeSourceInput.removeClass('invalid valid');
                    this.ui.playlistTitleInput.val(this.ui.playlistTitleInput.data('original-value'));

                    this.setDataSourceAsUserInput();
                }
                
            }.bind(this));

        }, 100),
        

        setDataSourceAsUserInput: function() {
            this.ui.youTubeSourceInput.data('datasource', new DataSource({
                type: DataSourceType.UserInput
            }));
        },
        
        validate: function () {
            //  If all submittable fields indicate themselves as valid -- allow submission.
            var valid = this.$el.find('.submittable.invalid').length === 0;
            return valid;
        },

        doOk: function () {
            var dataSource = this.ui.youTubeSourceInput.data('datasource');
            var playlistName = $.trim(this.ui.playlistTitleInput.val());

            Playlists.addPlaylistByDataSource(playlistName, dataSource);
        }

    });

    return CreatePlaylistView;
});