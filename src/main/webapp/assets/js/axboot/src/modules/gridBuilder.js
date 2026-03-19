/**
 * @function axboot.gridBuilder
 * @param {Object} _config
 * @example
 * ```js
 * this.target = axboot.gridBuilder({
 *    showLineNumber: false,
 *    showRowSelector: false,
 *    frozenColumnIndex: 0,
 *    target: $('[data-ax5grid="grid-view-01"]'),
 *    columns: [
 *        //menuId
 *        {key: "grpAuthCd", label: "권한그룹코드", width: 80, align: "center"},
 *        {key: "grpAuthNm", label: "권한그룹명", width: 160, align: "left"},
 *        {key: "useYn", label: "권한적용", editor: "checkYn"},
 *        {key: "schAh", label: "조회", width: 50, align: "center", editor: "menu-program-auth-checkYn"},
 *        /// --> 이것들을 list로 담아서  [PUT] "/api/v2/menu/auth"
 *    ],
 *    body: {
 *        onClick: function () {
 *            // this.self.select(this.dindex);
 *        }
 *    }
 * });
 * ```
 */
axboot.gridBuilder = (function () {
    var defaultGridConfig = {
        showLineNumber: true,
        lineNumberColumnWidth: 50,
        rowSelectorColumnWidth: 28,
        multipleSelect: false,
        header: {
            align: "center",
            columnHeight: 28
        },
        body: {
            columnHeight: 28,
            onClick: function () {
                this.self.select(this.dindex);
            }
        },
        page: {
            navigationItemCount: 9,
            height: 30,
            display: true,
            firstIcon: '<i class="cqc-controller-jump-to-start"></i>',
            prevIcon: '<i class="cqc-triangle-left"></i>',
            nextIcon: '<i class="cqc-triangle-right"></i>',
            lastIcon: '<i class="cqc-controller-next"></i>'
        }
    };

    var textAlignMap = {
        left: "near",
        center: "center",
        right: "far"
    };

    function normalizeEditor(editor) {
        if (!editor) return null;
        if (ax5.util.isString(editor)) {
            if (editor in axboot.gridBuilder.preDefineEditor) {
                if (ax5.util.isFunction(axboot.gridBuilder.preDefineEditor[editor])) {
                    return axboot.gridBuilder.preDefineEditor[editor]();
                }
                return $.extend({}, axboot.gridBuilder.preDefineEditor[editor]);
            }
            return null;
        }
        return $.extend({}, editor);
    }

    function normalizeColumns(columns) {
        var normalized = [];
        for (var i = 0, l = columns.length; i < l; i++) {
            var column = columns[i];
            if (axboot.gridBuilder.preDefineColumns[column.key]) {
                column = $.extend({}, axboot.gridBuilder.preDefineColumns[column.key], column);
            }

            if (column.columns) {
                column.columns = normalizeColumns(column.columns);
            }

            if (column.editor) {
                column.editor = normalizeEditor(column.editor);
                if (column.editor && ax5.util.isString(column.editor.disabled)) {
                    column.editor.disabled = axboot.gridBuilder.preDefineEditorDisabled[column.editor.disabled];
                }
            }
            normalized.push(column);
        }
        return normalized;
    }

    function buildFields(columns, fields) {
        for (var i = 0, l = columns.length; i < l; i++) {
            var column = columns[i];
            if (column.columns) {
                buildFields(column.columns, fields);
            } else {
                fields.push({fieldName: column.key});
            }
        }
    }

    function toRealGridColumn(column) {
        var align = textAlignMap[column.align] || "near";
        var rgColumn = {
            name: column.key,
            fieldName: column.key,
            width: column.width || 100,
            header: {text: column.label || column.key},
            styles: {textAlignment: align}
        };

        if (column.formatter) {
            rgColumn.__axbootFormatter = column.formatter;
        }

        if (column.editor) {
            rgColumn.editable = true;
            if (column.editor.type === "checkbox") {
                rgColumn.renderer = {
                    type: "check",
                    trueValues: column.editor.config ? column.editor.config.trueValue : "Y",
                    falseValues: column.editor.config ? column.editor.config.falseValue : "N"
                };
                rgColumn.editor = {type: "check"};
            } else if (column.editor.type === "select") {
                var options = column.editor.config && column.editor.config.options ? column.editor.config.options : [];
                var keys = column.editor.config && column.editor.config.columnKeys ? column.editor.config.columnKeys : {optionValue: "value", optionText: "text"};
                var values = [];
                var labels = [];
                for (var oi = 0; oi < options.length; oi++) {
                    values.push(options[oi][keys.optionValue]);
                    labels.push(options[oi][keys.optionText]);
                }
                rgColumn.editor = {
                    type: "dropdown",
                    values: values,
                    labels: labels,
                    domainOnly: true
                };
                rgColumn.lookupDisplay = true;
            } else if (column.editor.type === "number") {
                rgColumn.editor = {type: "number"};
            } else {
                rgColumn.editor = {type: "text"};
            }

            if (column.editor.disabled) {
                rgColumn.__axbootEditorDisabled = column.editor.disabled;
            }
        }

        return rgColumn;
    }

    function buildColumns(columns, list) {
        for (var i = 0, l = columns.length; i < l; i++) {
            var column = columns[i];
            if (column.columns) {
                buildColumns(column.columns, list);
            } else {
                list.push(toRealGridColumn(column));
            }
        }
    }

    function bindFormatters(columns, dataProvider) {
        for (var i = 0, l = columns.length; i < l; i++) {
            if (columns[i].__axbootFormatter) {
                (function (rgColumn) {
                    var formatter = rgColumn.__axbootFormatter;
                    rgColumn.displayCallback = function (grid, index, value) {
                        var item = dataProvider.getJsonRow(index.dataRow);
                        if (ax5.util.isString(formatter) && axboot.gridBuilder.formatter[formatter]) {
                            return axboot.gridBuilder.formatter[formatter](value, item);
                        }
                        if (ax5.util.isFunction(formatter)) {
                            return formatter.call({value: value, item: item, key: rgColumn.fieldName}, value, item);
                        }
                        return value;
                    };
                })(columns[i]);
            }
        }
    }

    function bindEditorDisabled(gridView, dataProvider, columns) {
        var disabledMap = {};
        for (var i = 0, l = columns.length; i < l; i++) {
            if (columns[i].__axbootEditorDisabled) {
                disabledMap[columns[i].fieldName] = columns[i].__axbootEditorDisabled;
            }
        }
        if ($.isEmptyObject(disabledMap)) return;

        gridView.onCellEditable = function (grid, index) {
            var fn = disabledMap[index.fieldName];
            if (!fn) return true;
            var item = dataProvider.getJsonRow(index.dataRow);
            return !fn.call({item: item, key: index.fieldName});
        };
    }

    return function (_config) {
        var myGridConfig = $.extend(true, {}, defaultGridConfig, _config);
        myGridConfig.columns = normalizeColumns(myGridConfig.columns || []);

        var targetEl = myGridConfig.target && myGridConfig.target.get ? myGridConfig.target.get(0) : myGridConfig.target;
        if (!targetEl) return null;
        if (!targetEl.id) {
            targetEl.id = "realgrid-" + ax5.getGuid();
        }

        var gridView = new RealGrid.GridView(targetEl.id);
        var dataProvider = new RealGrid.LocalDataProvider();
        gridView.setDataSource(dataProvider);

        var fields = [];
        buildFields(myGridConfig.columns, fields);
        dataProvider.setFields(fields);

        var rgColumns = [];
        buildColumns(myGridConfig.columns, rgColumns);
        gridView.setColumns(rgColumns);

        bindFormatters(rgColumns, dataProvider);
        bindEditorDisabled(gridView, dataProvider, rgColumns);

        gridView.setRowIndicator({
            visible: myGridConfig.showLineNumber,
            width: myGridConfig.lineNumberColumnWidth
        });
        gridView.setCheckBar({
            visible: myGridConfig.showRowSelector,
            width: myGridConfig.rowSelectorColumnWidth
        });
        gridView.setFixedOptions({
            colCount: myGridConfig.frozenColumnIndex || 0
        });
        if (myGridConfig.sortable) {
            gridView.setSortingOptions({enabled: true});
        }
        gridView.setEditOptions({
            editable: true,
            readOnly: false,
            insertable: true,
            appendable: true,
            updatable: true,
            deletable: true,
            commitByCell: true
        });
        gridView.setOptions({
            edit: {
                editable: true,
                readOnly: false,
                insertable: true,
                appendable: true,
                updatable: true,
                deletable: true
            }
        });
        if (gridView.setSelectOptions) {
            gridView.setSelectOptions({style: "none"});
        } else if (gridView.setSelectionOptions) {
            gridView.setSelectionOptions({style: "none"});
        } else {
            gridView.setOptions({select: {style: "none"}});
        }
        gridView.setDisplayOptions({
            rowHeight: 30
        });

        if (typeof setContextMenu === "function") {
            gridView.onContextMenuPopup = function () {
                setContextMenu(gridView);
                return true;
            };
            gridView.onContextMenuItemClicked = function (grid, data, index) {
                if (typeof onContextMenuClick === "function") {
                    onContextMenuClick(grid, data, index);
                }
            };
        }

        if (myGridConfig.body && ax5.util.isFunction(myGridConfig.body.onClick)) {
            gridView.onCellClicked = function (grid, clickData) {
                var itemIndex = clickData.itemIndex;
                if (itemIndex < 0) return;
                var context = {
                    self: wrapper,
                    dindex: itemIndex,
                    item: dataProvider.getJsonRow(itemIndex),
                    list: dataProvider.getJsonRows(0, -1),
                    column: clickData.fieldName,
                    value: clickData.value
                };
                myGridConfig.body.onClick.call(context);
            };
        }

        function startEditByKey(grid, keyCode) {
            if (grid.isEditing && grid.isEditing()) return false;
            if (keyCode === 229) {
                grid.showEditor();
                return true;
            }
            if (keyCode < 32 || keyCode > 126) return false;

            var current = grid.getCurrent();
            if (!current || current.itemIndex < 0 || !current.fieldName) return false;

            var column = grid.columnByName(current.fieldName);
            if (!column || column.editable !== true) return false;

            grid.showEditor();
            grid.setEditValue(String.fromCharCode(keyCode), true);
            return true;
        }

        gridView.onKeyDown = function (grid, key, ctrl, shift, alt) {
            if (ctrl || alt) return;
            return startEditByKey(grid, key);
        };

        targetEl.setAttribute("tabindex", "0");
        $(targetEl)
            .off("keydown.axboot-realgrid")
            .on("keydown.axboot-realgrid", function (event) {
                if (!event) return;
                if (event.ctrlKey || event.altKey || event.metaKey) return;
                var keyCode = event.which || event.keyCode;
                if (startEditByKey(gridView, keyCode)) {
                    event.preventDefault();
                }
            });

        var wrapper = {
            $target: $(targetEl),
            gridView: gridView,
            dataProvider: dataProvider,
            setData: function (data) {
                if (gridView.isEditing && gridView.isEditing()) {
                    gridView.commit(true);
                }
                var list = data && data.list ? data.list : data || [];
                dataProvider.setRows(list);
                if (data && data.page) {
                    this._page = data.page;
                }
            },
            getList: function (_type) {
                if (_type === "modified") {
                    var states = dataProvider.getAllStateRows();
                    var rows = (states.created || []).concat(states.updated || []);
                    return dataProvider.getJsonRows(rows);
                }
                if (_type === "deleted") {
                    var deleted = dataProvider.getAllStateRows().deleted || [];
                    return dataProvider.getJsonRows(deleted);
                }
                return dataProvider.getJsonRows(0, -1);
            },
            addRow: function (row, position, options) {
                dataProvider.addRow(row || {});
                if (options && options.focus === "END") {
                    var lastIndex = dataProvider.getRowCount() - 1;
                    if (lastIndex >= 0) {
                        gridView.setCurrent({itemIndex: lastIndex});
                    }
                }
            },
            deleteRow: function (_type) {
                var rows = [];
                if (_type === "checked") {
                    rows = gridView.getCheckedRows();
                } else {
                    rows = gridView.getSelectedRows();
                    if (!rows.length) {
                        rows = gridView.getCheckedRows();
                    }
                }
                if (rows.length) {
                    dataProvider.removeRows(rows);
                }
            },
            select: function (rowIndex, options) {
                if (options && options.selectedClear) {
                    gridView.clearSelection();
                }
                gridView.setCurrent({itemIndex: rowIndex});
                gridView.setSelection({startItem: rowIndex, endItem: rowIndex});
            },
            align: function () {
                if (gridView && gridView.resetSize) {
                    gridView.resetSize();
                }
            }
        };

        axboot.gridBuilder.instances.push(wrapper);
        return wrapper;
    };
})();

axboot.gridBuilder.instances = axboot.gridBuilder.instances || [];
axboot.gridBuilder.alignAll = function () {
    for (var i = 0, l = axboot.gridBuilder.instances.length; i < l; i++) {
        var instance = axboot.gridBuilder.instances[i];
        if (instance && instance.align) {
            instance.align();
        }
    }
};

axboot.gridBuilder.preDefineColumns = {
    "insDt": {width: 100, label: "등록일", align: "center"},
    "compCd": {width: 70, label: "업체코드", align: "center"},
    "compNm": {width: 110, label: "업체명", align: "left"},
    "storCd": {width: 70, label: "매장코드", align: "center"},
    "storNm": {width: 200, label: "매장명", align: "left"},
    "userNm": {width: 100, label: "이름", align: "center"},
    "itemCd": {width: 80, label: "품목코드", align: "center"},
    "itemNm": {width: 150, label: "품목명", align: "left"},
    "posItemNm": {width: 150, label: "POS단축명", align: "left"},
    "delYn": {
        width: 50, label: "삭제", align: "center", formatter: function () {
            return parent.COMMON_CODE["DEL_YN"].map[this.value];
        }
    },
    "useYn": {
        width: 70, label: "사용여부", align: "center", formatter: function () {
            return parent.COMMON_CODE["USE_YN"].map[this.value];
        }
    },
    "posUseYn": {
        width: 90, label: "포스사용여부", align: "center", formatter: function () {
            return parent.COMMON_CODE["USE_YN"].map[this.value];
        }
    },
    "sort": {width: 50, label: "정렬", align: "center"},
    "companyJson.대표자명": {width: 100, label: "대표자명", align: "center"},
    "companyJson.사업자등록번호": {
        label: "사업자등록번호",
        width: 120,
        align: "center",
        formatter: "bizno"
    },
    "storeInfoJson.대표자명": {width: 100, label: "대표자명", align: "center"},
    "storeInfoJson.사업자등록번호": {
        label: "사업자등록번호",
        width: 120,
        align: "center",
        formatter: "bizno"
    },
    "storeInfoJson.영업시작시간": {
        label: "영업시작시간",
        width: 100,
        align: "center"
    },
    "storeInfoJson.영업종료시간": {
        label: "영업종료시간",
        width: 100,
        align: "center"
    },
    "storeInfoJson.담당자": {
        label: "담당자",
        width: 70,
        align: "center"
    },
    "storeInfoJson.연락처": {
        label: "연락처",
        width: 100,
        align: "center"
    }
};

// 컬럼 확장 구문
axboot.gridBuilder.preDefineColumns["locale"] = (function () {
    return {
        width: 120, label: "국가", align: "center", formatter: function () {
            return parent.COMMON_CODE["LOCALE"].map[this.value];
        }
    };
})();

axboot.gridBuilder.preDefineColumns["printerType"] = (function () {
    return {
        width: 100, label: "프린터 타입", align: "center",
        formatter: function () {
            return parent.COMMON_CODE["PRINTER_TYPE"].map[this.value];
        }
    };
})();

axboot.gridBuilder.preDefineEditor = {
    "useYn": {
        type: "select", config: {
            columnKeys: {
                optionValue: "CD", optionText: "NM"
            },
            options: [
                {CD: "Y", NM: "사용"},
                {CD: "N", NM: "사용안함"}
            ]
        }
    },
    "checkYn": {
        type: "checkbox", config: {trueValue: "Y", falseValue: "N"}
    },
    "menu-program-auth-checkYn": {
        type: "checkbox", config: {trueValue: "Y", falseValue: "N"},
        disabled: function () {
            return this.item["program_" + this.key] == "N";
        }
    },
    "number": {
        type: "number"
    },
    "text": {
        type: "text"
    },
    "PRINTER_TYPE": function () {
        return {
            type: "select", config: {
                columnKeys: {
                    optionValue: "code", optionText: "name"
                },
                options: parent.COMMON_CODE["PRINTER_TYPE"]
            }
        };
    }
};

axboot.gridBuilder.preDefineEditorDisabled = {
    "notCreated": function () {
        return !this.item.__created__;
    }
};

axboot.gridBuilder.formatter = {
    "bizno": function (value) {
        var val = (value || "").replace(/\D/g, "");
        var regExpPattern = /^([0-9]{3})\-?([0-9]{1,2})?\-?([0-9]{1,5})?.*$/,
            returnValue = val.replace(regExpPattern, function (a, b) {
                var nval = [arguments[1]];
                if (arguments[2]) nval.push(arguments[2]);
                if (arguments[3]) nval.push(arguments[3]);
                return nval.join("-");
            });
        return returnValue;
    },
    "phone": function (value) {
        var val = (value || "").replace(/\D/g, "");
        var regExpPattern3 = /^([0-9]{3})\-?([0-9]{1,4})?\-?([0-9]{1,4})?\-?([0-9]{1,4})?\-?([0-9]{1,4})?/,
            returnValue = val.replace(regExpPattern3, function (a, b) {
                var nval = [arguments[1]];
                if (arguments[2]) nval.push(arguments[2]);
                if (arguments[3]) nval.push(arguments[3]);
                if (arguments[4]) nval.push(arguments[4]);
                if (arguments[5]) nval.push(arguments[5]);
                return nval.join("-");
            });
        return returnValue;
    }
};
