# adapt-tkhub-xAPI

An Adapt extension for adapt-trackingHub that implements xAPI tracking. It can send xAPI statements to an LRS, and save and load the state to/from the LRS.

It implements several launch methods, so you can use your Adapt course in different xAPI environments:

- Rustici launch ([tincan launch](https://github.com/RusticiSoftware/launch/blob/master/lms_lrs.md))
- [ADL xapi-launch](https://github.com/adlnet/xapi-launch)
- Spoor (custom method to allow xAPI tracking from within SCORM packages, specific to Adapt with adapt-contrib-spoor)
- Hardcoded (just for testing purposes, not to be used in a real xAPI enviroment).

There are plans to implement other launch methods in the future:

- CMI5
- LTI


**Important**: This extension works with [adapt-trackingHub](#), so it is required that it be installed and enabled in your course.

This extension uses the [xAPI Wrapper library](https://github.com/adlnet/xAPIWrapper) provided by ADL.

## Installation

Install adapt-trackingHub as explained in its [documentation](https://github.com/Acutilis/adapt-trackingHub/blob/master/README.md). It is recommended to get familiar with that extension and to read its Wiki, since it explains the main ideas behind trackingHub.

With the Adapt CLI installed, run the following from the command line:

`adapt install adapt-tkhub-xAPI`

To use it with the Authoring Tool, here in the github repository page click on 'Clone or download' and then click on the  'Download ZIP'. Upload that zip file to the Authoring Tool using the Plugin Manager. Within your course, click on 'Manage Extensions' and click on the green 'Add' button that appears to the right of adapt-trackingHub. Then open the 'Configuration Settings' for your course, and find the 'Extensions' section, click on the **tkhub-xAPI** button and configure it. 


## Settings

If you are using the framework, the settings for this extension should be added to course/config.json, in `_tkhub-xAPI`. If you are using the Authoring Tool, the settings are in your coures, in 'Configuration Settings', in the extension titled _tkhub xAPI Channel Handler_.

Here is the description of the settings:

- `_isEnabled`: True or false (defaults to true), to enable or disable this extension globally. Useful to turn on or off all the xAPI channels.
- `_channels`: An Array that contains objects with the settings for each channel you want to define.

The settings for **each** channel are:

- `_name`: An arbitrary name for the channel. It is used for logging to the browser's console, so you can clearly see from which channels the messages are coming.
- `_isEnabled`, `_reportsEvents`, `_tracksState`, `_isStateSource`, `_isStateStore`, `_isLaunchManager` and `_ignoreEvents`: These are explained in [the adatp-trackingHub documentation](https://github.com/Acutilis/adapt-trackingHub/blob/master/README.md). These settings (plus `_name`) are common to any type of channel. That is, any channel handler should implement them.

The following settings are _specific_ for the adapt-tkhub-xAPI extension:

- `_isFakeLRS`: True or false (defaults to false). Setting it to true will cause trackingHub to **not** attempt to send the statements to the LRS, it will just log the statement to the console, so you can see it. This way, you can develop/test without having a real LRS available.
- `_xapiLaunchMethod`: The launch method to use. It depends on how you plan to deploy your Adapt course. It has to be one of `hardcoded`, `rustici`, `adlxapi`, or `spoor`. Depending on which launch method is used, you will need to supply info to some of the following settings or others. Please see the [Launch Methods page in the Wiki](https://github.com/Acutilis/adapt-tkhub-xAPI/wiki/4.-Launch-Methods) for more information.
- `_homePage`: A URL to a system, used as an _identifier_. You only need to specify this setting if your channel uses the 'spoor' launch method.
- `_mbox`: A string. It can be anything you want, as long as its format is like "mailto:johndoe@example.com". You only need to specify this setting if your channel uses the 'hardcoded' launch method.
- `_fullName`: A string. It can be anything you want, just a person's name. You only need to specify this setting if your channel uses the 'hardcoded' launch method.
- `_endPoint`: It is the endPoint for the LRS that you want to use. You only need to specify this setting if your channel uses the 'hardcoded' or 'spoor' launch methods.
- `_userName`: A username for basic authentication in the LRS. You only need to specfy this setting if your channel uses the 'harcoded' or 'spoor' launch methods.
- `_password`: The password for basic authentication in the LRS.  You only need to specfy this setting if your channel uses the 'harcoded' or 'spoor' launch methods.

As you can see, some settings are specific to some launch methods. However, there is no harm if you set them all in the configuration, as shown in [example.json](#). The extension will only use the ones it needs, depending on the launch method selected.

## Further information

For more in-deph information, please visit the Wiki.

- Launch methods
    - Hardcoded
    - Rustici
    - ADL xapi-launch
    - Spoor
    - CMI5
    - LTI
- How statements are constructed
- What is tracked

