var widgetDirective = function($compile) {
  var Chart = {
    _render: function(node, data, chart, do_after){
      nv.addGraph(function() {
        d3.select(node)
          .datum(data).transition().duration(0)
          .call(chart);
        if (typeof do_after === "function") {
          do_after(node, chart)
        }
        nv.utils.windowResize(chart.update);
      })
    },
    _widgets: {
      Pie: "pie",
      StackedArea: "stack",
      TimeStackedArea: "timestack",
      Lines: "lines",
      Histogram: "histogram"
    },
    get_chart: function(widget) {
      if (widget in this._widgets) {
        var name = this._widgets[widget];
        return Chart[name]
      }
      return function() { console.log("Error: unexpected widget:", widget) }
    },
    pie: function(node, data, opts, do_after) {
      var chart = nv.models.pieChart()
        .x(function(d) { return d.key })
        .y(function(d) { return d.values })
        .showLabels(true)
        .labelType("percent")
        .donut(true)
        .donutRatio(0.25)
        .donutLabelsOutside(true)
        .color(function(d){
          if (d.data && d.data.color) { return d.data.color }
        });
      var colorizer = new Chart.colorizer("errors"), data_ = [];
      for (var i in data) {
        data_.push({key:data[i][0], values:data[i][1], color:colorizer.get_color(data[i][0])})
      }
      Chart._render(node, data_, chart)
    },
    colorizer: function(failure_key, failure_color) {
      this.failure_key = failure_key || "failed_duration";
      this.failure_color = failure_color || "#d62728";  // red
      this.color_idx = -1;
      /* NOTE(amaretskiy): this is actually a result of
         d3.scale.category20().range(), excluding red color (#d62728)
         which is reserved for errors */
      this.colors = ["#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c",
                     "#98df8a", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b",
                     "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7",
                     "#bcbd22", "#dbdb8d", "#17becf", "#9edae5"];
      this.get_color = function(key) {
        if (key === this.failure_key) {
          return this.failure_color
        }
        if (this.color_idx > (this.colors.length - 2)) {
          this.color_idx = 0
        } else {
          this.color_idx++
        }
        return this.colors[this.color_idx]
      }
    },
    stack: function(node, data, opts, do_after) {
      var chart = nv.models.stackedAreaChart()
        .x(function(d) { return d[0] })
        .y(function(d) { return d[1] })
        .useInteractiveGuideline(opts.guide)
        .showControls(opts.controls)
        .clipEdge(true);
      chart.xAxis
        .axisLabel(opts.xname)
        .tickFormat(opts.xformat)
        .showMaxMin(opts.showmaxmin);
      chart.yAxis
        .orient("left")
        .tickFormat(d3.format(opts.yformat || ",.3f"));
      var colorizer = new Chart.colorizer(), data_ = [];
      for (var i in data) {
        data_.push({key:data[i][0], values:data[i][1], color:colorizer.get_color(data[i][0])})
      }
      Chart._render(node, data_, chart, do_after);
    },
    // NOTE: nvd3 doesn't support to stack time series with different datasets...
    // see https://github.com/novus/nvd3/issues/220
    // We have to resample all iteration measurements to a common tick...
    // Straigh d3 may would be more felxible to do so.
    timestack: function(node, data, opts, do_after) {
      //NOTE: here data doesn't represents specific iteration data, but all complete output:
      //"complete_output": [[{"widget": "StackedArea", "title": "interim_rate measurements", "data": [["interim_rate", [[1476452786.953, 752.58], [1476452788.12, 645.44],
      //TODO?: process data somewhere else and call regular stack chart
      var chart = nv.models.stackedAreaChart()
        .x(function(d) { return d[0] })
        .y(function(d) { return d[1] })
        .useInteractiveGuideline(opts.guide)
        .showControls(opts.controls)
        .showLegend(false)
        .clipEdge(true);
      chart.xAxis
        .axisLabel(opts.xname)
        .tickFormat(opts.xformat)
        .showMaxMin(opts.showmaxmin);
      chart.yAxis
        .orient("left")
        .tickFormat(d3.format(opts.yformat || ",.3f"));
      var colorizer = new Chart.colorizer(), data_ = [];
      // figure out how measurements we have, note that we expect iterations to give all measurements or nothing
      var mes_cnt = d3.max(data.map(function(d) { if (d[0]){return d[0].data.length} else {return 0} }));
      //console.log(mes_cnt);
      // first pass to find the extent, sould be done with appropriate map call
      var extent = [];
      for (var mes=0; mes<mes_cnt; mes++) {
        extent[mes]=[];
        for (var i in data) {
          if (! data[i].length) {continue; }
          //console.log(data[i][0].data[mes]);
          extent[mes] = d3.extent(d3.merge([extent[mes], data[i][0].data[mes][1].map(function(d) { return d[0]; })]));
        }
      }
      //console.log(extent);
      var domain = [];
      for (var mes=0; mes<mes_cnt; mes++) {
        //TODO: when we'll switch to d3 v4.x, we'll be able to do:
        // var domain = d3.ticks(extent[mes][0], extent[mes][1], 250);
        domain[mes] = d3.range(extent[mes][0], extent[mes][1], (extent[mes][1]-extent[mes][0])/(100));
      }
      //console.log(domain);
      // 2nd pas to interpolate data to domain
      for (var mes=0; mes<mes_cnt; mes++) {
        //var res = domain[mes].map(function(d){return [d, 0.5]});
        for (var i in data) {
        //for (var i in [1]) {
          if (! data[i].length) {continue; }
          var sample = data[i][0].data[mes];
          //console.log(sample); // sample[0]: name, sample[1]:[list of points]
          var range = d3.extent(sample[1].map(function(d) { return d[0]; }));
          var bisect = d3.bisector(function(d) { return d[0]; });
          var res = domain[mes].map(function(d){
              if (d <= range[0]) { return [d, 0] }
              if (d > range[1]) { return [d, 0] }
              var index = bisect.left(sample[1], d);
              //console.log(index);
              if (index == sample[1].length - 1 ) { return [d, sample[1][index-1][1]] }
              // Poor's man resampling... Efficient enough anyway is output is not too variable
              var interpolated = sample[1][index-1][1] + (sample[1][index][1] - sample[1][index-1][1]) * (d - sample[1][index-1][0]) / (sample[1][index][0] - sample[1][index-1][0])
              //console.log(interpolated);
              return [d, interpolated];
          });
          data_.push({key:i, values:res, color:colorizer.get_color(i)});
        }
      }
      //console.log(data_);
      Chart._render(node, data_, chart, do_after);
     },
    lines: function(node, data, opts, do_after) {
      var chart = nv.models.lineChart()
        .x(function(d) { return d[0] })
        .y(function(d) { return d[1] })
        .useInteractiveGuideline(opts.guide)
        .clipEdge(true);
      chart.xAxis
        .axisLabel(opts.xname)
        .tickFormat(opts.xformat)
        .rotateLabels(opts.xrotate)
        .showMaxMin(opts.showmaxmin);
      chart.yAxis
        .orient("left")
        .tickFormat(d3.format(opts.yformat || ",.3f"));
      var colorizer = new Chart.colorizer(), data_ = [];
      for (var i in data) {
        data_.push({key:data[i][0], values:data[i][1], color:colorizer.get_color(data[i][0])})
      }
      Chart._render(node, data_, chart, do_after)
    },
    histogram: function(node, data, opts) {
      var chart = nv.models.multiBarChart()
        .reduceXTicks(true)
        .showControls(false)
        .transitionDuration(0)
        .groupSpacing(0.05);
      chart
        .legend.radioButtonMode(true);
      chart.xAxis
        .axisLabel("Duration (seconds)")
        .tickFormat(d3.format(",.2f"));
      chart.yAxis
        .axisLabel("Iterations (frequency)")
        .tickFormat(d3.format("d"));
      Chart._render(node, data, chart)
    }
  };

  return {
    restrict: "A",
    scope: { data: "=" },
    link: function(scope, element, attrs) {
      scope.$watch("data", function(data) {
        if (! data) { return console.log("Chart has no data to render!") }
        if (attrs.widget === "Table") {
          var ng_class = attrs.lastrowClass ? " ng-class='{"+attrs.lastrowClass+":$last}'" : "";
          var template = "<table class='striped'><thead>" +
            "<tr><th ng-repeat='i in data.cols track by $index'>{{i}}<tr>" +
            "</thead><tbody>" +
            "<tr" + ng_class + " ng-repeat='row in data.rows track by $index'>" +
            "<td ng-repeat='i in row track by $index'>{{i}}" +
            "<tr>" +
            "</tbody></table>";
          var el = element.empty().append($compile(template)(scope)).children()[0]
        } else if (attrs.widget === "TextArea") {
          var template = "<div style='padding:0 0 5px' ng-repeat='str in data track by $index'>{{str}}</div><div style='height:10px'></div>";
          var el = element.empty().append($compile(template)(scope)).children()[0]
        } else {

          var el_chart = element.addClass("chart").css({display:"block"});
          var el = el_chart.html("<svg></svg>").children()[0];

          var do_after = null;

          if (attrs.widget in {StackedArea:0, Lines:0}) {

            /* Hide widget if not enough data */
            if ((! data.length) || (data[0].length < 1) || (data[0][1].length < 2)) {
              return element.empty().css({display:"none"})
            }

            /* NOTE(amaretskiy): Dirty fix for changing chart width in case
               if there are too long Y values that overlaps chart box. */
            var do_after = function(node, chart){
              var g_box = angular.element(el_chart[0].querySelector(".nv-y.nv-axis"));

              if (g_box && g_box[0] && g_box[0].getBBox) {

                try {
                  // 30 is padding aroung graphs
                  var width = g_box[0].getBBox().width + 30;
                } catch (err) {
                  // This happens sometimes, just skip silently
                  return
                }

                // 890 is chart width (set by CSS)
                if (typeof width === "number" && width > 890) {
                  width = (890 * 2) - width;
                  if (width > 0) {
                    angular.element(node).css({width:width+"px"});
                    chart.update()
                  }
                }
              }
            }
          }
          else if (attrs.widget === "Pie") {
            if (! data.length) {
              return element.empty().css({display:"none"})
            }
          }

          var opts = {
            xname: attrs.nameX || "",
            xrotate: attrs.rotateX || 0,
            yformat: attrs.formatY || ",.3f",
            controls: attrs.controls === "true",
            guide: attrs.guide === "true",
            showmaxmin: attrs.showmaxmin === "true"
          };
          if (attrs.formatDateX) {
            opts.xformat = function(d) { return d3.time.format(attrs.formatDateX)(new Date(d)) }
          } else {
            opts.xformat = d3.format(attrs.formatX || "d")
          }
          Chart.get_chart(attrs.widget)(el, data, opts, do_after);
        }

        if (attrs.nameY) {
          /* NOTE(amaretskiy): Dirty fix for displaying Y-axis label correctly.
             I believe sometimes NVD3 will allow doing this in normal way */
          var label_y = angular.element("<div>").addClass("chart-label-y").text(attrs.nameY);
          angular.element(el).parent().prepend(label_y)
        }

        if (attrs.description) {
          var desc_el = angular.element("<div>").addClass(attrs.descriptionClass || "h3").text(attrs.description);
          angular.element(el).parent().prepend(desc_el)
        }

        if (attrs.title) {
          var title_el = angular.element("<div>").addClass(attrs.titleClass || "h2").text(attrs.title);
          angular.element(el).parent().prepend(title_el)
        }

        angular.element(el).parent().append(angular.element("<div style='clear:both'>"))
      });
    }
  }
};
