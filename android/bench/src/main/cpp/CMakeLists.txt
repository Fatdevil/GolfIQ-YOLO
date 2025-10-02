cmake_minimum_required(VERSION 3.22.1)
project(bench_ncnn)

add_library(bench_ncnn SHARED
    ncnn_bridge.cpp
)

find_library(log-lib log)

target_link_libraries(bench_ncnn PRIVATE ${log-lib})
