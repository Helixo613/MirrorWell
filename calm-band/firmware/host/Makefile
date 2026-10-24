# Linux build of the firmware core: unit tests + the simulated ESP32 used by the integration checks.
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra
CORE = ../calm_band/calm_core.cpp
all: test_core calm_band_sim
test_core: test_core.cpp $(CORE) ../calm_band/calm_core.h ../calm_band/sim_sources.h
	$(CXX) $(CXXFLAGS) -o $@ test_core.cpp $(CORE)
calm_band_sim: host_main.cpp $(CORE) ../calm_band/calm_core.h ../calm_band/sim_sources.h
	$(CXX) $(CXXFLAGS) -o $@ host_main.cpp $(CORE) -lmosquitto
test: test_core
	./test_core
clean:
	rm -f test_core calm_band_sim
